import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
const js = (p) => transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const url = (c) => 'data:text/javascript;base64,' + Buffer.from(c).toString('base64')
const vu = url(js('lib/viewing-status.ts'))
const { statusPanel } = await import(url(js('lib/rental-journey.ts').replace(/'@\/lib\/viewing-status'/, `'${vu}'`)))
for (const p of ['withdrawn','rejected','unknown','under_review','info_requested','v_none','v_waiting','v_proposed','v_scheduled','v_decide','v_confirm','v_declined','v_retry','awaiting_tenancy','terms_none','terms_review','terms_waiting_landlord','terms_accepted','terms_signed','active','ended']) {
  if (!statusPanel(p, { tenancyId: 't1' })) console.log('MISSING PANEL:', p)
}
console.log('done')