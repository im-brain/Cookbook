# vendor/

`supabase.js` is a pinned copy of Supabase's browser library (`@supabase/supabase-js` **2.118.0**, MIT licence,
© Supabase), bundled once into a single file so the website needs no build step.

How it was made (in a scratch folder, not in this repository):

```
npm i @supabase/supabase-js@2.118.0 esbuild
echo 'import { createClient } from "@supabase/supabase-js"; globalThis.supabase = { createClient };' > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=iife --target=safari15 --legal-comments=none --outfile=supabase.js
```

It adds one global, `supabase.createClient`. To update it, repeat with a newer version and change the number above.
