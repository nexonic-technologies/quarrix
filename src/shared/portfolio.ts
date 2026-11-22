export type Portfolio={name:string;role:string;contact:string;summary:string;experience:string;education:string;skills:string;projects:string;template:string;target:string};
export const EMPTY_PORTFOLIO:Portfolio={name:'',role:'',contact:'',summary:'',experience:'',education:'',skills:'',projects:'',target:'',template:'Dear hiring team,\n\nI am interested in {target}.\n\n{summary}\n\nThank you for your consideration.\n{name}'};
export function validatePortfolio(input:unknown):Portfolio{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid career portfolio.');
 const row=input as Record<string,unknown>;const out={...EMPTY_PORTFOLIO};
 for(const k of Object.keys(out) as (keyof Portfolio)[]){const v=row[k];if(typeof v!=='string'||v.length>(['name','role','contact','target'].includes(k)?500:15000))throw new Error('Invalid portfolio field.');out[k]=v;}
 return out;
}
export function portfolioText(p:Portfolio,kind:'cv'|'portfolio'|'application'){
 if(kind==='application')return p.template.replace(/\{(name|role|contact|summary|experience|education|skills|projects|target)\}/g,(_,key:keyof Portfolio)=>p[key]);
 const sections=kind==='cv'?[['PROFILE',p.summary],['EXPERIENCE',p.experience],['EDUCATION',p.education],['SKILLS',p.skills],['PROJECTS',p.projects]]:[['ABOUT',p.summary],['PROJECTS',p.projects],['SKILLS',p.skills],['EXPERIENCE',p.experience],['EDUCATION',p.education]];
 return [p.name,p.role,p.contact,...sections.filter(([,v])=>v.trim()).flatMap(([h,v])=>['',h,v])].filter((x,i)=>i>2||x.trim()).join('\n');
}
