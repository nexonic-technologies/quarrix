package com.nexonic.quarrix;

import java.net.URI;
import java.text.Normalizer;
import java.util.*;

final class Opportunity {
    final String source, title, employer, location, url, detail, date, kind, evidence;
    Opportunity(String source, String title, String employer, String location, String url, String detail, String date, String kind, String evidence) {
        this.source=source; this.title=title; this.employer=employer; this.location=location; this.url=url; this.detail=detail; this.date=date; this.kind=kind; this.evidence=evidence;
    }
    static String norm(String s) { return Normalizer.normalize(s, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}\\p{M}]+", " ").trim(); }
    static Set<String> words(String s) { Set<String> out=new LinkedHashSet<>(Arrays.asList(norm(s).split(" "))); out.remove(""); return out; }
    boolean matches(String query) { return words(title+" "+employer+" "+location+" "+detail).containsAll(words(query)); }
    int skillMatch(String skills) { Set<String> wanted=words(skills); if(wanted.isEmpty()) return -1; Set<String> available=words(title+" "+detail); long n=wanted.stream().filter(available::contains).count(); return (int)Math.round(100.0*n/wanted.size()); }
    String key() { return source+"|"+url; }
    static boolean safeLink(String value) { try { URI u=URI.create(value); return "https".equalsIgnoreCase(u.getScheme()) && u.getHost()!=null && u.getUserInfo()==null && u.getPort()==-1; } catch (RuntimeException e) { return false; } }
    static List<Opportunity> filtered(Collection<Opportunity> rows, String query) { Map<String,Opportunity> result=new LinkedHashMap<>(); for(Opportunity o:rows) if(!o.title.trim().isEmpty() && safeLink(o.url) && o.matches(query)) result.putIfAbsent(o.key(),o); return new ArrayList<>(result.values()); }
}
