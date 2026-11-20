# Adding your own business source (Source SDK)

Quarrix can search any HTTPS JSON API that you are allowed to use. You describe the API in a small JSON file and put it in the **sources** folder (Settings → Sources → "Open the sources folder"). No code runs.

## Example

```json
{
  "id": "acme-directory",
  "name": "Acme Business Directory",
  "license": "CC BY 4.0",
  "attribution": "Acme Directory",
  "url": "https://api.acme.example/v1/places?q={category}&city={city}&country={country}",
  "items": "data.results",
  "fields": { "name": "title", "phone": "contact.phone", "website": "links.web", "address": "address.line1", "city": "address.city", "lat": "geo[0]", "lon": "geo[1]", "id": "uid" },
  "pages": { "param": "page", "start": 1, "step": 1, "max": 5 },
  "keyHeader": "X-Api-Key",
  "delayMs": 1000
}
```

## Fields

| Field | Required | What it is |
|---|---|---|
| `id` | Yes | 2–32 lowercase letters, digits or dashes. Shown on leads as `sdk:<id>`. |
| `name` | Yes | The name shown in Quarrix. |
| `license` | Yes | The data's licence, shown in the source catalog. |
| `attribution` | Yes | The credit line, shown on leads and in exports. |
| `url` | Yes | An `https://` link. `{category}`, `{city}`, `{country}`, `{lat}` and `{lon}` are filled in and URL-encoded. |
| `items` | Yes | The path to the list of results, for example `results` or `data.places`. Use `""` if the response itself is the list. |
| `fields` | Yes | Paths inside each result. `name` is required; `category`, `address`, `city`, `region`, `country`, `postcode`, `lat`, `lon`, `phone`, `email`, `website` and `id` are optional. |
| `pages` | No | Page parameter, first value, step, and a maximum of 50 pages. |
| `keyHeader` / `keyQuery` | No | If the API needs a key, the header or query parameter it goes in. Enter the key in Settings → Sources; it is stored encrypted. |
| `delayMs` | No | Wait between pages, at least 500 ms. |

## Safety rules

- Only `https://` links, and only public internet addresses. Links to this computer or the local network are refused, including after redirects or DNS changes.
- Responses are capped at 5 MB.
- Requests count towards the source's daily limit (Settings → Sources → Limits).
- Paths are plain property names and `[number]` indexes. There are no expressions, filters or scripts.
- Invalid files are listed with the reason in Settings → Sources and are never used.

Only add APIs whose terms allow your use, including storing and contacting the businesses you find.
