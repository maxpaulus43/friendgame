import { shuffle, UserError } from '../util.js';

const VOTE_POINTS = 100;
const WINNER_BONUS = 50;

// Quick sanity check that an upload is really the image it claims to be,
// so a broken file is refused (and retaken) instead of showing up blank.
export function looksLikeImage(buf, mime) {
  if (mime === 'image/jpeg') return buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/png') return buf.length > 50 && buf[0] === 0x89 && buf[1] === 0x50;
  if (mime === 'image/webp') return buf.length > 50 && buf.toString('ascii', 8, 12) === 'WEBP';
  return buf.length > 100;
}

// Shared engine for "everyone makes something, then everyone votes" games.
// kind: 'photo' | 'audio'
export function mediaVoteGame({ kind, captureMs, voteMs, prompts, maxBytes, mimes, ...meta }) {
  const toVote = (r) => {
    const subs = [...r.data.subs.entries()];
    if (subs.length < 2) return finishUp(r);
    r.data.order = shuffle(subs.map(([, s]) => s.mediaId));
    r.setStep('vote', voteMs, () => finishUp(r));
  };

  const finishUp = (r) => {
    const { subs, votes } = r.data;
    const points = {};
    const counts = {};
    for (const [pid] of subs) counts[pid] = 0;
    for (const [, mediaId] of votes) {
      const author = ownerOf(r, mediaId);
      if (author) counts[author]++;
    }
    for (const [pid, n] of Object.entries(counts)) points[pid] = n * VOTE_POINTS;
    const best = Math.max(0, ...Object.values(counts));
    for (const [pid, n] of Object.entries(counts)) if (best > 0 && n === best) points[pid] += WINNER_BONUS;
    r.finish(points);
  };

  const ownerOf = (r, mediaId) => {
    for (const [pid, s] of r.data.subs) if (s.mediaId === mediaId) return pid;
    return null;
  };

  const check = (r) => {
    const active = r.activeIds();
    if (r.step === 'capture' && active.length && active.every((id) => r.data.subs.has(id))) toVote(r);
    else if (r.step === 'vote') {
      // You can't vote if the only entry is your own.
      const mustVote = active.filter((id) => r.data.order.some((m) => ownerOf(r, m) !== id));
      if (mustVote.every((id) => r.data.votes.has(id))) finishUp(r);
    }
  };

  return {
    ...meta,
    minPlayers: 2,
    start(r) {
      r.data = { prompt: r.freshPrompt(prompts), subs: new Map(), votes: new Map(), order: [] };
      r.setStep('capture', captureMs, () => toVote(r));
    },
    action(r, pid, msg) {
      if (!r.isIn(pid)) return;
      const late = r.step === 'vote' && !r.data.subs.has(pid);
      if (msg.a === 'submit' && (r.step === 'capture' || late)) {
        // Phones re-send until they see their upload confirmed; keep the first copy.
        if (msg.uploadId && r.data.subs.get(pid)?.uploadId === msg.uploadId) return;
        const m = /^data:([\w/.+-]+)(?:;[^,]*)?;base64,(.+)$/.exec(msg.data || '');
        if (!m) throw new UserError('That upload looked broken. Try again?', 'badupload');
        const mime = m[1].split(';')[0];
        if (!mimes.some((x) => mime.startsWith(x))) throw new UserError(`Can't use a ${mime} file here.`, 'badupload');
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > maxBytes) throw new UserError('That file is too big.', 'badupload');
        if (kind === 'photo' && !looksLikeImage(buf, mime)) throw new UserError('That photo came through broken. Please take it again.', 'badupload');
        const mediaId = r.putMedia(buf, mime);
        r.data.subs.set(pid, { mediaId, uploadId: String(msg.uploadId ?? '') });
        // Arrived just after time ran out (or the host skipped): it still counts.
        if (late) r.data.order.push(mediaId);
        r.touch();
        check(r);
      } else if (r.step === 'vote' && msg.a === 'vote') {
        const owner = ownerOf(r, msg.id);
        if (!owner || owner === pid) return;
        r.data.votes.set(pid, msg.id);
        r.touch();
        check(r);
      }
    },
    check,
    view(r, pid) {
      const d = r.data;
      const base = { kind, prompt: d.prompt };
      if (r.step === 'capture') {
        const mine = d.subs.get(pid);
        return { ...base, submitted: [...(d.subs?.keys() ?? [])], mine: mine ? r.mediaUrl(mine.mediaId) : null, mineUpload: mine?.uploadId ?? null };
      }
      if (r.step === 'vote') {
        return {
          ...base,
          entries: d.order.map((id) => ({ id, url: r.mediaUrl(id), mine: ownerOf(r, id) === pid })),
          myVote: d.votes.get(pid) ?? null,
          voted: [...d.votes.keys()],
          submitted: [...d.subs.keys()],
          mineUpload: d.subs.get(pid)?.uploadId ?? null,
        };
      }
      if (r.step === 'results') {
        const entries = [...d.subs.entries()].map(([author, s]) => ({
          id: s.mediaId,
          url: r.mediaUrl(s.mediaId),
          author,
          voters: [...d.votes.entries()].filter(([, m]) => m === s.mediaId).map(([v]) => v),
        }));
        entries.sort((a, b) => b.voters.length - a.voters.length);
        return { ...base, entries };
      }
      return base;
    },
  };
}
