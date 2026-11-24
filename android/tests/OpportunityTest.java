package com.nexonic.quarrix;

import java.util.*;
public final class OpportunityTest {
    static Opportunity job(String url,String location){return new Opportunity("Fixture","React Developer","Example Company",location,url,"react typescript css","2026-01-01","job","Provider listing");}
    static void check(boolean value, String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args){
        Opportunity a=job("https://example.com/a","東京"),b=job("https://example.com/b","大阪");
        check(a.matches("developer react"),"word order");check(!a.matches("developer python"),"missing terms");
        check(a.matches("東京"),"Unicode location");check(a.skillMatch("react python")==50,"skill match");check(a.skillMatch("")==-1,"empty profile");
        check(Opportunity.filtered(Arrays.asList(a,a,b),"developer").size()==2,"duplicate URL only");
        check(!Opportunity.safeLink("javascript:alert(1)"),"unsafe link");check(!Opportunity.safeLink("http://example.com"),"cleartext");check(!Opportunity.safeLink("https://user@example.com"),"credentials");check(Opportunity.safeLink(a.url),"HTTPS");
        System.out.println("10 opportunity assertions passed");
    }
}
