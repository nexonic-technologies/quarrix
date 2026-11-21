# Job trust and employer evidence

Quarrix shows an **evidence score**, not a probability of legitimacy or a legal identity verification. A user initiates a check from a job's detail panel. The optional employer careers page must be independently known to the user.

| Evidence | Points |
| --- | ---: |
| HTTPS listing link (including final destination) | 10 |
| Readable listing containing the stated job title | 20 |
| Job title present | 10 |
| Stated company name present | 10 |
| Separate user-supplied employer page names the company and links the exact vacancy | 50 |

Each contextual warning subtracts 20 points, with a minimum of zero. Warning categories are possible recruitment fee, unusual payment, and sensitive information requests. They show the original excerpt and do not assert fraud. Negated safety advice is excluded. The absence of warnings does not establish safety.

Unknown or restricted pages remain unknown; HTTP 404/410 or a clear closure notice is reported as closed, not fraudulent. A career page lacking a matching link may be dynamic or incomplete. Shared hiring systems, a URL that merely names the employer, and other vacancies on the same domain are not sufficient evidence. The checker preserves job identifiers and fragments, discarding only known tracking parameters.

No personal information, CV, banking data or account credentials are transmitted. The checker makes up to two bounded public-page reads through the existing guarded HTTP client, does not log in or circumvent access restrictions, and does not run in the background. Reports are displayed for the current job with a timestamp. The employer's legal identity, job eligibility and employment terms still require independent confirmation.

General job-scam safety guidance: [U.S. Federal Trade Commission consumer advice](https://consumer.ftc.gov/articles/job-scams).
