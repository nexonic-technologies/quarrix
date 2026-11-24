package com.nexonic.quarrix;

import android.content.SharedPreferences;
import android.text.Html;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class Discovery {
    static final long TTL=60*60*1000L, MAX_AGE=7*24*TTL;
    final SharedPreferences cache;
    Discovery(SharedPreferences cache) { this.cache=cache; }
    static final class Result { final List<Opportunity> rows=new ArrayList<>(); final List<String> status=new ArrayList<>(); }
    interface Parser { List<Opportunity> parse(JSONObject j) throws JSONException; }
    static JSONObject get(String address) throws IOException, JSONException {
        HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(10000); c.setReadTimeout(15000);
        c.setRequestProperty("Accept","application/json"); c.setRequestProperty("User-Agent","Quarrix-Android/1.0.0");
        try {
            int code=c.getResponseCode(); if(code!=200) throw new IOException("HTTP "+code);
            try(InputStream in=c.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[8192]; int n; while((n=in.read(buffer))!=-1) { if(out.size()+n>3_000_000) throw new IOException("Response too large"); out.write(buffer,0,n); }
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { c.disconnect(); }
    }
    void source(Result r,String key,String label,String address,Parser parser) {
        long now=System.currentTimeMillis(), stamp=cache.getLong(key+".time",0); String old=cache.getString(key+".data","");
        long age=now-stamp;
        if(age>=0 && age<TTL && !old.isEmpty()) {
            try { r.rows.addAll(parser.parse(new JSONObject(old))); r.status.add(label+": cached ("+age/60000+" min old)"); return; } catch(Exception ignored) {}
        }
        try {
            JSONObject j=get(address); List<Opportunity> rows=parser.parse(j); r.rows.addAll(rows);
            String data=j.toString(); if(data.length()<1_500_000) cache.edit().putString(key+".data",data).putLong(key+".time",now).apply();
            r.status.add(label+": live · "+rows.size()+" records returned");
        } catch(Exception failure) {
            if(age>=0 && age<MAX_AGE && !old.isEmpty()) try { r.rows.addAll(parser.parse(new JSONObject(old))); r.status.add(label+": unavailable · offline snapshot ("+age/3600000+" h old)"); return; } catch(Exception ignored) {}
            r.status.add(label+": unavailable · no usable snapshot");
        }
    }
    Result search(String mode,String query) {
        Result r=new Result();
        if(mode.equals("business")) {
            String encoded=android.net.Uri.encode(query);
            if(!query.equals(cache.getString("registry.query",""))) cache.edit().remove("registry.data").remove("registry.time").putString("registry.query",query).apply();
            source(r,"registry", "French public registry", "https://recherche-entreprises.api.gouv.fr/search?q="+encoded+"&per_page=20", j->registry(j));
        } else {
            source(r,"jobicy","Jobicy","https://jobicy.com/api/v2/remote-jobs?count=50",Discovery::jobicy);
            source(r,"arbeitnow","Arbeitnow","https://www.arbeitnow.com/api/job-board-api?page=1",Discovery::arbeitnow);
        }
        List<Opportunity> filtered=Opportunity.filtered(r.rows,mode.equals("business")?"":query); r.rows.clear(); r.rows.addAll(filtered); return r;
    }
    static String clean(String html) { String s=Html.fromHtml(html,Html.FROM_HTML_MODE_LEGACY).toString().replaceAll("\\s+"," ").trim(); return s.substring(0,Math.min(1600,s.length())); }
    static String list(JSONObject x,String key) { JSONArray a=x.optJSONArray(key); if(a==null) return x.optString(key,""); List<String> parts=new ArrayList<>(); for(int i=0;i<a.length();i++) parts.add(a.optString(i)); return String.join(", ",parts); }
    static List<Opportunity> jobicy(JSONObject j) throws JSONException {
        JSONArray a=j.getJSONArray("jobs"); List<Opportunity> rows=new ArrayList<>();
        for(int i=0;i<a.length();i++) { JSONObject x=a.getJSONObject(i); rows.add(new Opportunity("Jobicy",x.optString("jobTitle"),x.optString("companyName"),x.optString("jobGeo","Unspecified")+" · Remote",x.optString("url"),clean(list(x,"jobIndustry")+" "+list(x,"jobType")+" "+x.optString("jobExcerpt")),x.optString("pubDate"),"job","Provider listing · employer not independently confirmed")); } return rows;
    }
    static List<Opportunity> arbeitnow(JSONObject j) throws JSONException {
        JSONArray a=j.getJSONArray("data"); List<Opportunity> rows=new ArrayList<>();
        for(int i=0;i<a.length();i++) { JSONObject x=a.getJSONObject(i); rows.add(new Opportunity("Arbeitnow",x.optString("title"),x.optString("company_name"),x.optString("location")+(x.optBoolean("remote")?" · Remote":""),x.optString("url"),clean(list(x,"tags")+" "+x.optString("description")),x.optLong("created_at",0)>0?java.time.Instant.ofEpochSecond(x.optLong("created_at")).toString():"","job","Provider listing · employer not independently confirmed")); } return rows;
    }
    static List<Opportunity> registry(JSONObject j) throws JSONException {
        JSONArray a=j.getJSONArray("results"); List<Opportunity> rows=new ArrayList<>();
        for(int i=0;i<a.length();i++) { JSONObject x=a.getJSONObject(i); String siren=x.optString("siren"); if(!siren.matches("[0-9]{9}")) continue; JSONObject seat=x.optJSONObject("siege"); rows.add(new Opportunity("French public registry",x.optString("nom_complet"),"SIREN "+siren,seat==null?"France":seat.optString("adresse","France"),"https://annuaire-entreprises.data.gouv.fr/entreprise/"+siren,"SIREN "+siren,"","business","A".equals(x.optString("etat_administratif"))?"Official registry · active record":"Official registry · not marked active")); } return rows;
    }
}
