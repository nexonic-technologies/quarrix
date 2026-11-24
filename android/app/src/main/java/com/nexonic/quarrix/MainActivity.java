package com.nexonic.quarrix;

import android.app.Activity;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int BG=0xfff4f5f0, INK=0xff152b27, GREEN=0xff155d53, MUTED=0xff52665e, WHITE=0xffffffff;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private SharedPreferences local;
    private Discovery discovery;
    private LinearLayout root, content, nav, results;
    private EditText input;
    private String mode="job", page="discover", query="", skills="";
    private List<Opportunity> found=new ArrayList<>();
    private List<String> sourceStatus=new ArrayList<>();
    private boolean busy=false, destroyed=false;
    private int generation=0;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        local=getSharedPreferences("workspace",MODE_PRIVATE); discovery=new Discovery(getSharedPreferences("public_cache",MODE_PRIVATE)); skills=local.getString("skills","");
        root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{ if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(i.left,i.top,i.right,i.bottom);}else{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());}return insets; });
        setContentView(root);
        LinearLayout mast=new LinearLayout(this); mast.setOrientation(LinearLayout.VERTICAL); mast.setPadding(dp(22),dp(20),dp(22),dp(12));
        mast.addView(label("QUARRIX  /  MOBILE",12,GREEN,true)); mast.addView(label("Opportunity desk",30,INK,true));
        mast.addView(label("Independent search. Your data stays on your device.",13,MUTED,false)); root.addView(mast);
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true); content=new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(20),dp(6),dp(20),dp(20)); scroll.addView(content); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        nav=new LinearLayout(this); nav.setPadding(dp(10),dp(8),dp(10),dp(8)); root.addView(nav); render();
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView label(String s,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);t.setPadding(0,dp(3),0,dp(3));return t;}
    private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private Button button(String s,boolean active,Runnable action){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextSize(14);b.setTextColor(active?WHITE:GREEN);b.setBackground(shape(active?GREEN:0xffe2ebe4,14));b.setMinHeight(dp(48));b.setPadding(dp(9),dp(6),dp(9),dp(6));b.setOnClickListener(v->action.run());return b;}
    private void addButton(LinearLayout row,String s,boolean active,Runnable action){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(48),1);p.setMargins(dp(3),dp(3),dp(3),dp(3));row.addView(button(s,active,action),p);}
    private void render(){
        content.removeAllViews(); nav.removeAllViews();
        addButton(nav,"Discover",page.equals("discover"),()->switchPage("discover")); addButton(nav,"Saved",page.equals("saved"),()->switchPage("saved")); addButton(nav,"Profile",page.equals("profile"),()->switchPage("profile"));
        if(page.equals("discover")) discoverPage(); else if(page.equals("saved")) savedPage(); else profilePage();
    }
    private void switchPage(String next){if(input!=null&&page.equals("discover"))query=input.getText().toString();page=next;render();}
    private void discoverPage(){
        LinearLayout switcher=new LinearLayout(this);addButton(switcher,"Find a job",mode.equals("job"),()->setMode("job"));addButton(switcher,"Find customers",mode.equals("business"),()->setMode("business"));content.addView(switcher);
        content.addView(label(mode.equals("job")?"Find your next role":"Find registered businesses",22,INK,true));
        content.addView(label(mode.equals("job")?"Recent Jobicy and Arbeitnow listings. Global remote and European coverage; not every vacancy.":"Official French company registry. France only in this edition.",14,MUTED,false));
        input=new EditText(this);input.setSingleLine(true);input.setHint(mode.equals("job")?"Role, skill or location":"Company, industry or city");input.setText(query);input.setTextColor(INK);input.setPadding(dp(14),dp(9),dp(14),dp(9));input.setBackground(shape(WHITE,14));content.addView(input,new LinearLayout.LayoutParams(-1,dp(56)));
        Button search=button(busy?"Searching…":"Search opportunities",true,this::search);search.setEnabled(!busy);LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,dp(48));sp.setMargins(0,dp(10),0,dp(8));content.addView(search,sp);
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);content.addView(results);showResults();
    }
    private void setMode(String m){if(mode.equals(m))return;if(busy){Toast.makeText(this,"Wait for the current search",Toast.LENGTH_SHORT).show();return;}generation++;mode=m;query="";found=new ArrayList<>();sourceStatus=new ArrayList<>();render();}
    private void search(){String q=input.getText().toString().trim();if(q.isEmpty()||q.length()>160){Toast.makeText(this,"Enter 1–160 characters",Toast.LENGTH_SHORT).show();return;}query=q;busy=true;found=new ArrayList<>();sourceStatus=new ArrayList<>();int token=++generation;String selected=mode;render();io.submit(()->{Discovery.Result r=discovery.search(selected,q);runOnUiThread(()->{if(destroyed||token!=generation)return;busy=false;found=r.rows;sourceStatus=r.status;if(page.equals("discover"))render();});});}
    private void showResults(){if(busy){results.addView(label("Contacting public sources…",15,MUTED,false));return;}for(String s:sourceStatus)results.addView(label(s,12,MUTED,false));if(!sourceStatus.isEmpty())results.addView(label(found.size()+" matching opportunities",19,INK,true));if(found.isEmpty())results.addView(label(sourceStatus.isEmpty()?"Start a search to see source-linked opportunities.":"No matching records in available sources. Try a broader query or retry later.",15,MUTED,false));for(Opportunity o:found)card(results,o,false,"");}
    private JSONArray saved(){try{return new JSONArray(local.getString("saved","[]"));}catch(JSONException e){return new JSONArray();}}
    private JSONObject pack(Opportunity o,String status)throws JSONException{return new JSONObject().put("source",o.source).put("title",o.title).put("employer",o.employer).put("location",o.location).put("url",o.url).put("detail",o.detail).put("date",o.date).put("kind",o.kind).put("evidence",o.evidence).put("status",status);}
    private Opportunity unpack(JSONObject j){return new Opportunity(j.optString("source"),j.optString("title"),j.optString("employer"),j.optString("location"),j.optString("url"),j.optString("detail"),j.optString("date"),j.optString("kind"),j.optString("evidence"));}
    private boolean isSaved(Opportunity o){JSONArray a=saved();for(int i=0;i<a.length();i++){JSONObject j=a.optJSONObject(i);if(j!=null&&unpack(j).key().equals(o.key()))return true;}return false;}
    private void save(Opportunity o,String status,boolean remove){JSONArray a=saved(),next=new JSONArray();boolean existed=false;try{for(int i=0;i<a.length();i++){JSONObject j=a.optJSONObject(i);if(j==null)continue;if(unpack(j).key().equals(o.key())){existed=true;if(!remove)next.put(pack(o,status));}else next.put(j);}if(!remove&&!existed){if(next.length()>=500){Toast.makeText(this,"Saved limit reached (500)",Toast.LENGTH_SHORT).show();return;}next.put(pack(o,status));}local.edit().putString("saved",next.toString()).apply();render();}catch(JSONException e){Toast.makeText(this,"Could not save",Toast.LENGTH_SHORT).show();}}
    private void card(LinearLayout parent,Opportunity o,boolean savedPage,String status){LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);c.setPadding(dp(15),dp(13),dp(15),dp(13));c.setBackground(shape(WHITE,18));LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);cp.setMargins(0,dp(8),0,dp(5));parent.addView(c,cp);
        c.addView(label(o.source.toUpperCase(Locale.ROOT),11,GREEN,true));c.addView(label(o.title,19,INK,true));c.addView(label(o.employer+" · "+o.location,13,MUTED,false));if(!o.date.isEmpty())c.addView(label(o.date,12,MUTED,false));c.addView(label(o.evidence,12,GREEN,true));int match=o.skillMatch(skills);if(o.kind.equals("job")&&match>=0)c.addView(label("Skills overlap: "+match+"% · keyword estimate only",13,GREEN,false));if(!o.detail.isEmpty())c.addView(label(o.detail,13,INK,false));
        LinearLayout row=new LinearLayout(this);addButton(row,"Open source",true,()->open(o.url));if(savedPage){addButton(row,"Remove",false,()->save(o,"",true));}else{addButton(row,isSaved(o)?"Saved":"Save",false,()->{if(!isSaved(o))save(o,"Saved",false);});}c.addView(row);
        if(savedPage){String[] options=o.kind.equals("job")?new String[]{"Saved","Applied","Interview","Offer","Closed"}:new String[]{"Saved","Researching","Contacted","Qualified","Closed"}; Spinner spinner=new Spinner(this);ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,options);spinner.setAdapter(adapter);int idx=Arrays.asList(options).indexOf(status);spinner.setSelection(Math.max(0,idx));spinner.setContentDescription("Tracking status for "+o.title);spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> p){}public void onItemSelected(AdapterView<?> p,View v,int pos,long id){if(!options[pos].equals(status))save(o,options[pos],false);}});c.addView(spinner);}
    }
    private void savedPage(){content.addView(label("Saved opportunities",24,INK,true));content.addView(label("Track applications and business research privately.",14,MUTED,false));JSONArray a=saved();if(a.length()==0)content.addView(label("No saved opportunities yet.",15,MUTED,false));for(int i=0;i<a.length();i++){JSONObject j=a.optJSONObject(i);if(j!=null)card(content,unpack(j),true,j.optString("status","Saved"));}}
    private void profilePage(){content.addView(label("Your skills",24,INK,true));content.addView(label("Enter skills or paste CV keywords. Matching runs locally; your profile is never sent to a provider. This is not an employer verification score.",15,MUTED,false));EditText field=new EditText(this);field.setMinLines(4);field.setText(skills);field.setHint("e.g. Java, Excel, sales, design");field.setTextColor(INK);field.setBackground(shape(WHITE,14));field.setPadding(dp(14),dp(12),dp(14),dp(12));content.addView(field);content.addView(button("Save profile",true,()->{String s=field.getText().toString();if(s.length()>10000){Toast.makeText(this,"Limit: 10,000 characters",Toast.LENGTH_SHORT).show();return;}skills=s;local.edit().putString("skills",skills).apply();Toast.makeText(this,"Saved on device",Toast.LENGTH_SHORT).show();}));content.addView(label("No account · No mandatory API key · No hosted backend",14,GREEN,true));content.addView(label("Version 1.0.0 · Source listings may be incomplete or outdated. Always confirm the original posting before acting.",13,MUTED,false));}
    private void open(String url){if(!Opportunity.safeLink(url)){Toast.makeText(this,"Invalid source link",Toast.LENGTH_SHORT).show();return;}try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException e){Toast.makeText(this,"No browser available",Toast.LENGTH_SHORT).show();}}
    @Override protected void onDestroy(){destroyed=true;io.shutdownNow();super.onDestroy();}
}
