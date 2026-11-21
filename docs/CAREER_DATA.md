# Career exploration data

Quarrix includes a compact, offline occupation catalog derived from the **O*NET® 31.0 Database** by the [U.S. Department of Labor, Employment and Training Administration](https://www.dol.gov/agencies/eta), used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). O*NET® is a trademark of USDOL/ETA. Nexonic Technologies adapted this information; USDOL/ETA has not approved, endorsed, or tested these modifications.

- Source: [official downloadable database](https://www.onetcenter.org/database.html), version 31.0. [License](https://www.onetcenter.org/license_db.html).
- Input files: `occupation_data.csv` (1,016 records), `essential_skills.csv` (18,200), `transferable_skills.csv` (45,500), `software_skills.csv` (31,821). The importer rejects incomplete distributions.
- Transformation: keep occupation IDs and titles; select up to eight highest-importance non-suppressed essential/transferable skills; deduplicate software examples. 910 occupations have rated skills. All 1,016 occupations retain their original IDs and titles.
- Regenerate: `node scripts/import-occupations.mjs occupation_data.csv essential_skills.csv transferable_skills.csv software_skills.csv`.
- Ranking is deterministic and local: matching occupational title terms, recorded skills, and software examples contribute to a discovery score. It is not a hiring probability, credential assessment, or indication that the person lacks unlisted skills. US occupational classifications do not establish licensing eligibility in another country.
- Neither the typed profile nor the CV is sent to the catalog provider. A job search occurs only when the person selects an occupation and starts a search.
