import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectCurrentInstitutions() {
  const { data: insts, count } = await sb.from('institutions').select('*', { count: 'exact' });
  console.log('Total institutions in Supabase:', count);
  if (insts && insts.length > 0) {
    console.log('Sample institution record in DB:', insts[0]);
    const withMetadata = insts.filter(i => i.metadata && Object.keys(i.metadata).length > 0);
    console.log('Records with non-empty metadata:', withMetadata.length);
    if (withMetadata.length > 0) {
      console.log('Sample metadata:', withMetadata[0].metadata);
    }
  }
}

inspectCurrentInstitutions().catch(console.error);
