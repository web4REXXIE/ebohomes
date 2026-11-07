import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/20261204_05_inspector_surroundings.sql', 'utf8')
assert.match(sql, /inspector_record_surroundings/)
assert.match(sql, /review_status <> 'submitted'/)                 // only an inspection waiting for review
assert.match(sql, /j\.inspector_id is distinct from uid/)         // only the assigned inspector
assert.match(sql, /eb_surroundings_answer_ok/)                    // fixed answers only
assert.match(sql, /'straight_line'/)                              // distance method labelled
assert.doesNotMatch(sql, /'published'/)                           // inspectors never publish
assert.match(sql, /grant execute on function public\.eb_inspection_register_file\([^)]*\) to service_role/)

const route = readFileSync('app/api/inspection-evidence/register/route.ts', 'utf8')
assert.match(route, /p_topic: topic/)
assert.match(route, /PHOTO_TOPICS\.some/)

const page = readFileSync('app/inspector/page.tsx', 'utf8')
assert.match(page, /inspector_record_surroundings/)
assert.match(page, /withTopic/)
assert.match(page, /<SurroundingsForm/)

const form = readFileSync('components/surroundings-form.tsx', 'utf8')
assert.match(form, /straight line/)
assert.match(form, /looksLikeSafetyClaim/)

console.log('inspector-surroundings: all checks passed')
