import { api, json, params } from '@/lib/http';
import { deleteDraftAssessment, finalizeAssessment, getAssessment, reviseAssessment, saveScores } from '@/lib/services/csms-assessment';
import { choice } from '@/lib/validation';
export const GET = api(async (request, context, user) => getAssessment(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => saveScores(user, (await params(context)).id, await json(request)));
// FINALIZE mengunci hasil; REVISE membuat revisi draft dari versi final terakhir.
export const POST = api(async (request, context, user) => {
  const { id } = await params(context);
  const { action, ...body } = await json(request);
  return choice(action, ['FINALIZE', 'REVISE'], 'Aksi') === 'FINALIZE' ? finalizeAssessment(user, id) : reviseAssessment(user, id, body);
});
export const DELETE = api(async (request, context, user) => deleteDraftAssessment(user, (await params(context)).id));
