#!/usr/bin/env python3
import json, re, html, urllib.request, urllib.parse, unicodedata
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
UA = 'QAJobRadar/5.0 (+personal job discovery dashboard)'

class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self,data): self.parts.append(data)

def strip_html(s):
    p=TextParser()
    try: p.feed(html.unescape(str(s or '')))
    except Exception: return re.sub(r'<[^>]+>',' ',str(s or ''))
    return re.sub(r'\s+',' ',' '.join(p.parts)).strip()

def norm(s):
    s=unicodedata.normalize('NFD',str(s or '')).encode('ascii','ignore').decode().lower()
    return re.sub(r'\s+',' ',s).strip()

def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=35) as r: return json.load(r)

def n(v):
    try: return float(v)
    except (TypeError,ValueError): return None

def listify(v):
    if v is None: return []
    if isinstance(v,list): return v
    return [v]

def structured_salary(raw):
    if isinstance(raw.get('salary'),dict): return raw['salary']
    lo=n(raw.get('salaryMin',raw.get('annualSalaryMin',raw.get('salary_min',raw.get('salary_minimum',raw.get('minSalary'))))))
    hi=n(raw.get('salaryMax',raw.get('annualSalaryMax',raw.get('salary_max',raw.get('salary_maximum',raw.get('maxSalary'))))))
    if lo is None and hi is None: return None
    cur=str(raw.get('salaryCurrency',raw.get('salary_currency',raw.get('currency','?')))).upper()
    per=norm(raw.get('salaryPeriod',raw.get('salary_period',raw.get('salaryInterval','yearly'))))
    mult=12 if 'month' in per else 52 if 'week' in per and 'fortnight' not in per else 26 if 'fortnight' in per else 2080 if 'hour' in per else 1
    return {'min':round(lo*mult) if lo is not None else None,'max':round(hi*mult) if hi is not None else None,'currency':cur or '?','period':'yearly','estimated':False}

def text_salary(text):
    s=str(text or '')
    cur='EUR' if ('€' in s or re.search(r'\bEUR\b',s,re.I)) else 'USD' if ('$' in s or re.search(r'\bUSD\b',s,re.I)) else None
    m=re.search(r'(?:€|\$|EUR|USD)?\s*([2-9]\d)(?:[\.,](\d{3}))?\s*[kK]?\s*(?:-|–|a|to|hasta)\s*(?:€|\$|EUR|USD)?\s*([2-9]\d)(?:[\.,](\d{3}))?\s*[kK]?',s,re.I)
    if m:
        a=int(m.group(1))*(1000 if int(m.group(1))<1000 else 1)+(int(m.group(2)) if m.group(2) else 0)
        b=int(m.group(3))*(1000 if int(m.group(3))<1000 else 1)+(int(m.group(4)) if m.group(4) else 0)
        if 20000<=a<=300000 and 20000<=b<=300000: return {'min':a,'max':b,'currency':cur or 'EUR','period':'yearly','estimated':True}
    for p in (r'(?:€|EUR)\s*([2-9]\d)\s*[kK]\b',r'([2-9]\d)\s*[kK]\s*(?:€|EUR)\b',r'(?:\$|USD)\s*([2-9]\d)\s*[kK]\b',r'([2-9]\d)[\.,](\d{3})\s*(?:€|EUR)\b'):
        m=re.search(p,s,re.I)
        if not m: continue
        val=int(m.group(1))*1000+(int(m.group(2)) if m.lastindex and m.lastindex>1 else 0)
        if 20000<=val<=300000: return {'min':val,'max':None,'currency':'USD' if '$' in m.group(0) or 'USD' in m.group(0).upper() else 'EUR','period':'yearly','estimated':True}
    return None

def modality(raw,text,source=''):
    preset=raw.get('modality')
    if preset in ('remote','hybrid','onsite'): return preset
    t=norm(text)
    if re.search(r'\b(hybrid|hibrido|hibrida|teletrabajo parcial|remote & onsite|remote and onsite|semi-presencial|semipresencial)\b',t): return 'hybrid'
    if raw.get('remote') is True or source in ('Jobicy','Remotive','Himalayas'):
        return 'remote'
    if 'remote' in norm(raw.get('jobGeo')) or 'remote' in norm(raw.get('location')) or re.search(r'\b(remote|remoto|work from home|home office|fully remote|100% remote)\b',t): return 'remote'
    return 'onsite'

def madrid_area(location,description=''):
    loc=norm(location)
    if any(norm(x) in loc for x in CONFIG['madrid_area_terms']): return True
    if loc in ('spain','espana','no indicada',''):
        txt=norm(description[:1200]); return any(norm(x) in txt for x in CONFIG['madrid_area_terms'])
    return False

def excluded(title,text):
    t=norm(f'{title} {text[:1300]}')
    if re.search(r'\bjunior\b',norm(title)): return True
    return any(norm(x) in t for x in CONFIG['exclude'])

def employment_label(raw,text):
    if raw.get('employment_label'): return str(raw['employment_label'])
    vals=[]
    for key in ('jobType','job_type','job_types','type','employmentType','employment_type'):
        vals.extend(map(str,listify(raw.get(key))))
    t=norm(' '.join(vals)+' '+text[:800])
    if any(x in t for x in ('full-time','full time','fulltime','jornada completa','tiempo completo')): return 'Jornada completa'
    if any(x in t for x in ('part-time','part time','medio tiempo','jornada parcial')): return 'Jornada parcial'
    if 'internship' in t or 'practicas' in t: return 'Prácticas'
    return 'Jornada no indicada · validar'

def non_full_time(raw,text):
    e=employment_label(raw,text)
    return e in ('Jornada parcial','Prácticas') or any(x in norm(text[:700]) for x in ('freelance only','freelance position'))

def remote_geo_risk(location,text):
    loc=norm(location); t=norm(f'{location} {text[:1800]}')
    hard=(
        'united states only','us only','usa only','canada only','india only','latin america only','latam only','australia only','new zealand only',
        'must be located in the us','must reside in the us','us-based only','north america only','uk only','united kingdom only',
        'must be based in the united states','must be based in canada','must be based in india','must be located in north america'
    )
    if any(x in t for x in hard): return 'Restricción geográfica: puede no admitir trabajo desde España'
    restricted_locations=('united states','usa','canada','india','australia','new zealand','latin america','latam','north america')
    open_locations=('worldwide','anywhere','global','europe','european union','eu','emea','spain','espana','remote')
    if any(x==loc or loc.startswith(x+',') for x in restricted_locations) and not any(x in loc for x in open_locations):
        return 'Restricción geográfica: la ubicación publicada no parece compatible con España'
    return None

def remote_eligible(j):
    if j['modality']!='remote': return True
    if not j.get('geoRisk'): return True
    # Keep as reviewable only when score is very high; most restricted remote jobs are not useful.
    return j['score']>=80

def extract_languages(raw,text):
    if raw.get('languages'):
        return [str(x) for x in listify(raw.get('languages'))]
    t=norm(text); out=[]
    lang_defs=[('Inglés','english|ingles'),('Francés','french|frances'),('Alemán','german|aleman'),('Portugués','portuguese|portugues'),('Italiano','italian|italiano'),('Español','spanish|espanol')]
    for label,pat in lang_defs:
        if not re.search(rf'\b(?:{pat})\b',t): continue
        level=''
        windows=[]
        for m in re.finditer(rf'\b(?:{pat})\b',t): windows.append(t[max(0,m.start()-70):m.end()+90])
        w=' '.join(windows)
        if re.search(r'\bc2\b|native|nativo|bilingual|bilingue',w): level=' C2/nativo'
        elif re.search(r'\bc1\b|advanced|avanzado|professional high|nivel profesional alto',w): level=' C1/avanzado'
        elif re.search(r'\bb2\+?\b|fluent|fluido|professional',w): level=' B2/fluido'
        elif re.search(r'\bb1\b|intermediate|intermedio',w): level=' B1'
        out.append(label+level)
    return out

def language_risk(langs,text):
    values=' | '.join(langs)
    nvals=norm(values)
    if any(x in nvals for x in ('frances','aleman','portugues','italiano')):
        return 'Idioma adicional solicitado · no figura en tu CV'
    if 'ingles' in nvals or 'english' in norm(text):
        if any(x in nvals for x in ('c1','c2','nativo','avanzado')): return 'Inglés C1/avanzado · tu CV indica nivel básico'
        if any(x in nvals for x in ('b2','fluido')): return 'Inglés B2/fluido · por encima del nivel indicado en tu CV'
        return 'Inglés solicitado · revisar nivel requerido'
    return None

def extract_experience(raw,text):
    if raw.get('experience'): return str(raw['experience'])
    t=norm(text[:5000])
    pats=[
      r'(\d+)\s*(?:-|–|to|a)\s*(\d+)\s*(?:years?|anos?)',
      r'(\d+)\+\s*(?:years?|anos?)',
      r'(?:minimum|at least|more than|mas de|más de|al menos|minimo|minimo de|minimo alrededor de)\s*(?:de\s*)?(\d+)\s*(?:years?|anos?)',
      r'(?:experience|experiencia)\s*(?::|of|de)?\s*(\d+)\+?\s*(?:years?|anos?)'
    ]
    for i,p in enumerate(pats):
        m=re.search(p,t)
        if not m: continue
        if i==0: return f'{m.group(1)}-{m.group(2)} años'
        return f'{m.group(1)}+ años'
    return 'No indicada'

def experience_min(exp):
    m=re.match(r'\s*(\d+)',norm(exp)); return int(m.group(1)) if m else None

def extract_contract(raw,text):
    if raw.get('contract'): return str(raw['contract'])
    t=norm(text[:2500])
    if 'contrato indefinido' in t or 'permanent contract' in t or 'permanent position' in t: return 'Indefinido'
    if 'temporary contract' in t or 'contrato temporal' in t: return 'Temporal'
    if 'contractor' in t or 'contract position' in t: return 'Contrato / contractor'
    return 'No indicado'

def extract_work_pattern(raw,text):
    if raw.get('work_pattern'): return str(raw['work_pattern'])
    t=norm(text[:2500])
    m=re.search(r'(\d)\s*(?:-|/|a|to)\s*(\d)\s*(?:dias|days).{0,35}(?:office|oficina|presencial)',t)
    if m: return f'{m.group(1)}-{m.group(2)} días en oficina'
    m=re.search(r'(\d)\s*(?:dias|days).{0,35}(?:office|oficina|presencial)',t)
    if m: return f'{m.group(1)} días en oficina'
    if re.search(r'100%\s*(?:remote|remoto)|fully remote',t): return '100% remoto'
    return None

def extract_education(raw,text):
    if raw.get('education'): return str(raw['education'])
    t=norm(text[:3500])
    if re.search(r'\b(bachelor|university degree|college degree|grado universitario|titulacion universitaria|licenciatura)\b',t): return 'Titulación universitaria mencionada'
    return None

def profile_matches(text):
    t=norm(text); matches=[]; weighted=0
    for s in CONFIG['profile_skills']:
        if any(norm(a) in t for a in s['aliases']):
            matches.append(s['label']); weighted += float(s.get('weight',1))
    return matches, weighted

def market_matches(text,profile_labels):
    t=norm(text); req=[]
    for s in CONFIG.get('market_skills',[]):
        if any(norm(a) in t for a in s['aliases']): req.append(s['label'])
    # Keep profile technologies in the requested stack too when the job mentions them.
    req = list(dict.fromkeys(req + profile_labels))
    profile_norm={norm(x) for x in profile_labels}
    missing=[x for x in req if norm(x) not in profile_norm and x not in ('QA / testing',)]
    return req[:16], missing[:8]

def score(j):
    title=norm(j['title']); body=norm(' '.join([j['title'],j['description'],' '.join(j['tags'])]))
    if any(norm(r) in title for r in CONFIG['target_roles']): role=25
    elif re.search(r'\b(qa|quality assurance|test|testing|tester|validation|verification|v&v)\b',title): role=21
    elif re.search(r'\b(firmware|network|telecom|iot|system|embedded|wireless|rf|broadband|device)\b',title) and re.search(r'\b(test|qa|validation|verification|quality)\b',body): role=18
    else: role=8 if re.search(r'\b(quality|validation|verification|test)\b',body) else 0
    prof,weighted=profile_matches(body)
    profile_score=min(40,weighted)
    exp_min=experience_min(j['experience'])
    exp_score=8 if exp_min is None or exp_min<=CONFIG['experience_years'] else 5 if exp_min<=5 else 1 if exp_min<=6 else 0
    mode_score=7 if j['modality']=='remote' else 5 if j['modality']=='hybrid' else 0
    lang_score=5 if not j['languageRisk'] else 2 if 'revisar' in norm(j['languageRisk']) else 0
    sal=j.get('salary'); salary_score=3
    if sal and sal.get('currency')=='EUR':
        floor=sal.get('min'); ceil=sal.get('max')
        if floor and floor>=CONFIG['salary_min_eur']: salary_score=5
        elif ceil and ceil>=CONFIG['salary_min_eur']: salary_score=2
        else: salary_score=0
    geo_penalty=-10 if j.get('geoRisk') else 0
    total=round(role+profile_score+exp_score+mode_score+lang_score+salary_score+geo_penalty)
    breakdown={'role':role,'profile':round(profile_score,1),'experience':exp_score,'modality':mode_score,'language':lang_score,'salary':salary_score,'geo':geo_penalty}
    return max(0,min(100,total)),prof,breakdown

def normalize(raw,source):
    title=raw.get('jobTitle') or raw.get('title') or raw.get('name') or ''
    company=raw.get('companyName') or raw.get('company_name') or raw.get('company') or ''
    loc=raw.get('jobGeo') or raw.get('candidate_required_location') or raw.get('location')
    if not loc and raw.get('locationRestrictions'):
        loc=', '.join(map(str,listify(raw.get('locationRestrictions'))))
    location=loc or 'Remote / no indicada'
    desc=strip_html(raw.get('jobDescription') or raw.get('description') or raw.get('contents') or raw.get('jobExcerpt') or raw.get('excerpt') or '')
    tags=[]
    for v in (raw.get('tags'),raw.get('jobIndustry'),raw.get('jobLevel'),raw.get('category'),raw.get('parentCategories')):
        tags.extend(map(str,listify(v)))
    tags=list(dict.fromkeys(x for x in tags if x and x!='None'))
    url=raw.get('url') or raw.get('jobUrl') or raw.get('apply_url') or raw.get('applicationLink') or raw.get('refs',{}).get('landing_page','')
    published=raw.get('pubDate') or raw.get('created_at') or raw.get('publication_date') or raw.get('published') or raw.get('date')
    jid=raw.get('id') or raw.get('guid') or raw.get('slug') or raw.get('jobSlug') or url or f'{title}-{company}'
    mod=modality(raw,f'{title} {location} {desc}',source)
    sal=structured_salary(raw) or text_salary(raw.get('salary') if isinstance(raw.get('salary'),str) else desc)
    langs=extract_languages(raw,desc)
    exp=extract_experience(raw,desc)
    employment=employment_label(raw,desc)
    j={'id':str(jid),'source':source,'title':str(title).strip(),'company':str(company).strip(),'location':str(location),'description':desc,'tags':tags,'url':str(url),'published':published,'modality':mod,'salary':sal,'score_override':n(raw.get('score_override')),
       'languages':langs,'experience':exp,'employment':employment,'contract':extract_contract(raw,desc),'workPattern':extract_work_pattern(raw,desc),'education':extract_education(raw,desc)}
    j['madridArea']=madrid_area(j['location'],j['description'])
    j['geoRisk']=remote_geo_risk(j['location'],j['description']) if mod=='remote' else None
    j['languageRisk']=language_risk(langs,j['description'])
    j['score'],j['matchedSkills'],j['scoreBreakdown']=score(j)
    req,missing=market_matches(' '.join([j['title'],j['description'],' '.join(j['tags'])]),j['matchedSkills'])
    j['requestedSkills']=req; j['missingSkills']=missing
    if j['score_override'] is not None: j['score']=max(0,min(100,round(j['score_override'])))
    if j['salary'] and j['salary'].get('currency')=='EUR':
        lo=j['salary'].get('min'); hi=j['salary'].get('max')
        if hi and hi<CONFIG['salary_min_eur']: j['salaryRisk']=f'Salario máximo publicado por debajo de {CONFIG["salary_min_eur"]//1000}k'
        elif lo and lo<CONFIG['salary_min_eur'] and hi and hi>=CONFIG['salary_min_eur']: j['salaryRisk']=f'La banda incluye importes < {CONFIG["salary_min_eur"]//1000}k · confirmar oferta'
        elif lo is None and hi and hi>=CONFIG['salary_min_eur']: j['salaryRisk']=f'Tope publicado {int(hi/1000)}k · confirmar que la oferta sea ≥ {CONFIG["salary_min_eur"]//1000}k'
        else: j['salaryRisk']=None
    else: j['salaryRisk']=None
    return j

def fresh_enough(j,days=50):
    if not j.get('published'): return True
    try:
        d=datetime.fromisoformat(str(j['published']).replace('Z','+00:00'))
        if d.tzinfo is None: d=d.replace(tzinfo=timezone.utc)
        return d >= datetime.now(timezone.utc)-timedelta(days=days)
    except Exception: return True

def valid(j,raw):
    if not j['title'] or not j['company'] or not j['url']: return False
    if excluded(j['title'],j['description']): return False
    if CONFIG['full_time_only'] and non_full_time(raw,j['description']): return False
    if not fresh_enough(j): return False
    if j['salary'] and j['salary'].get('currency')=='EUR':
        top=j['salary'].get('max') or j['salary'].get('min')
        if top and top<CONFIG['salary_min_eur']: return False
    if j['modality'] in ('hybrid','onsite') and not j['madridArea']: return False
    if j['modality']=='onsite' and j['score']<CONFIG['onsite_min_score']: return False
    if j['modality']=='remote' and not remote_eligible(j): return False
    return j['score']>=CONFIG.get('min_feed_score',45)

def fetch_jobicy():
    out=[]
    endpoints=[]
    for geo in ('spain','europe','anywhere'):
        for tag in ('qa','test engineer','quality assurance','quality engineer','firmware','embedded testing','device testing','validation','network testing','telecom testing','iot testing','wireless testing','wifi testing','automation testing'):
            endpoints.append('https://jobicy.com/api/v2/remote-jobs?'+urllib.parse.urlencode({'count':200,'geo':geo,'tag':tag}))
    for url in endpoints:
        try:
            for raw in get_json(url).get('jobs',[]):
                raw['remote']=True
                j=normalize(raw,'Jobicy')
                if valid(j,raw): out.append(j)
        except Exception as e: print('Jobicy warning:',e)
    return out

def fetch_himalayas():
    out=[]
    terms=('qa','quality assurance','quality engineer','test engineer','system test','validation engineer','firmware test','device test','embedded test','network test','wireless test','iot qa','test automation')
    for q in terms:
        for page in (1,2,3):
            # Remote may be worldwide; compatibility with Spain is checked from the location restriction/text afterwards.
            url='https://himalayas.app/jobs/api/search?'+urllib.parse.urlencode({'q':q,'employment_type':'Full Time','sort':'recent','page':page})
            try: data=get_json(url)
            except Exception as e: print('Himalayas warning:',e); break
            rows=data.get('jobs') or data.get('data') or []
            if not rows: break
            for raw in rows:
                raw['remote']=True
                j=normalize(raw,'Himalayas')
                if valid(j,raw): out.append(j)
    return out

def fetch_remotive():
    out=[]
    try: rows=get_json('https://remotive.com/api/remote-jobs').get('jobs',[])
    except Exception as e: print('Remotive warning:',e); return out
    for raw in rows:
        raw['remote']=True
        j=normalize(raw,'Remotive')
        if valid(j,raw): out.append(j)
    return out

def fetch_arbeitnow():
    out=[]
    for page in range(1,13):
        try: data=get_json(f'https://www.arbeitnow.com/api/job-board-api?page={page}')
        except Exception as e: print('Arbeitnow warning:',e); break
        rows=data.get('data',[])
        if not rows: break
        for raw in rows:
            j=normalize(raw,'Arbeitnow')
            if valid(j,raw): out.append(j)
    return out

def fetch_curated():
    path=ROOT/'data'/'curated_jobs.json'
    if not path.exists(): return []
    try: data=json.loads(path.read_text(encoding='utf-8'))
    except Exception: return []
    now=datetime.now(timezone.utc).timestamp(); out=[]
    for raw in data.get('jobs',[]):
        expires=raw.get('expires_at')
        if expires:
            try:
                if datetime.fromisoformat(expires).timestamp()<=now: continue
            except Exception: pass
        j=normalize(raw,raw.get('source','LinkedIn'))
        if valid(j,raw): out.append(j)
    return out

def previous_source(source):
    path=ROOT/'data'/'jobs.json'
    try: rows=json.loads(path.read_text(encoding='utf-8')).get('jobs',[])
    except Exception: return []
    out=[]
    for raw in rows:
        if raw.get('source')!=source: continue
        try:
            j=normalize(raw,source)
            if valid(j,raw): out.append(j)
        except Exception: pass
    return out

def semantic_title(title):
    t=norm(title)
    t=re.sub(r'\b(senior|sr\.?|junior|jr\.?|all genders|h/m|m/f/d|f/m/d)\b','',t)
    t=re.sub(r'[^a-z0-9+& ]',' ',t)
    return re.sub(r'\s+',' ',t).strip()

def title_similarity(a,b):
    A={x for x in semantic_title(a).split() if len(x)>1}
    B={x for x in semantic_title(b).split() if len(x)>1}
    if not A or not B: return 0
    return len(A&B)/max(len(A),len(B))

def same_vacancy(a,b):
    return norm(a['company'])==norm(b['company']) and title_similarity(a['title'],b['title'])>=0.78

def dedupe(items):
    out=[]
    for j in items:
        idx=next((i for i,x in enumerate(out) if same_vacancy(x,j)),None)
        if idx is None:
            j['sources']=[j['source']]
            out.append(j); continue
        prev=out[idx]
        winner=j if j['score']>prev['score'] or (j.get('published') and str(j.get('published'))>str(prev.get('published') or '')) else prev
        winner['sources']=list(dict.fromkeys(prev.get('sources',[prev['source']])+j.get('sources',[j['source']])))
        if not winner.get('salary'): winner['salary']=prev.get('salary') or j.get('salary')
        if not winner.get('languages'): winner['languages']=prev.get('languages') or j.get('languages') or []
        out[idx]=winner
    return out

def main():
    curated=fetch_curated()
    fetched=[]
    fetched += fetch_jobicy()
    fetched += fetch_himalayas()
    fetched += fetch_arbeitnow()
    # Remotive asks public API users to poll only a few times/day. Refresh it every 6 UTC hours and keep its last active set between runs.
    if datetime.now(timezone.utc).hour % 6 == 0:
        fetched += fetch_remotive()
    else:
        fetched += previous_source('Remotive')
    jobs=dedupe(curated+fetched)
    prio={'remote':3,'hybrid':2,'onsite':1}
    jobs.sort(key=lambda j:(j['score'],prio.get(j['modality'],0),str(j.get('published') or '')),reverse=True)
    target=ROOT/'data'/'jobs.json'
    if not jobs:
        print('No jobs fetched; preserving existing feed.'); return
    payload={'updated_at':datetime.now(timezone.utc).isoformat(),'jobs':jobs,'sources':sorted(set(j['source'] for j in jobs))}
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Wrote {len(jobs)} jobs ({len(curated)} curated) from {len(payload["sources"])} sources')

if __name__=='__main__': main()
