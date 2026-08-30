const fs = require('fs');
const file = 'apps/api/src/modules/analytics/analytics.service.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `CROSS JOIN LATERAL jsonb_array_elements(oi."optionsSnapshot") AS elem`;
const repl = `CROSS JOIN LATERAL jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(oi."optionsSnapshot") = 'array' THEN oi."optionsSnapshot"
              ELSE '[]'::jsonb
            END
          ) AS elem`;

content = content.replace(target, repl);
fs.writeFileSync(file, content);
