import { newCharacter } from '../src/core/character';
import { newMatchRecord } from '../src/data/storage';
import { makeConfig } from '../src/config';
import { participantFrom, rosterFrom } from '../src/ui/prematch';
import { profileRecord } from '../src/ui/profiles';

describe('pre-match helpers', () => {
  const chars = ['Ari', 'Mike', 'Sam', 'Kit'].map((n) => newCharacter(n));
  const byId = new Map(chars.map((c) => [c.id, c]));

  it('a participant copies the character (so editing it later cannot change a match in progress)', () => {
    const c = chars[0];
    c.master = true;
    const p = participantFrom(c, 'p1');
    expect(p).toMatchObject({ name: 'Ari', master: true, characterId: c.id, profileId: 'p1' });
    expect(p.sprite!.pixels).toHaveLength(16 * 24);
    c.stats.power = 10;
    expect(p.stats.power).toBe(5);
  });

  it('the lineup maps to fixed positions, and guests have no profile id', () => {
    const r = rosterFrom(byId, { A: [chars[1].id, chars[0].id], B: [chars[2].id, chars[3].id] }, { A: 'p1', B: '' });
    expect(r['A-left'].name).toBe('Mike');
    expect(r['A-right'].name).toBe('Ari');
    expect(r['B-right'].name).toBe('Kit');
    expect(r['A-left'].profileId).toBe('p1');
    expect(r['B-left'].profileId).toBeNull();
  });

  it('profile record counts finished matches and wins by the team the profile played on', () => {
    const m1 = newMatchRecord(makeConfig(), new Date(), 'm1');
    m1.roster['A-left'].profileId = 'p1';
    m1.roster['A-right'].profileId = 'p1';
    m1.winner = 'A';
    const m2 = newMatchRecord(makeConfig(), new Date(), 'm2');
    m2.roster['B-left'].profileId = 'p1';
    m2.winner = 'A';
    const unfinished = newMatchRecord(makeConfig(), new Date(), 'm3');
    unfinished.roster['A-left'].profileId = 'p1';
    expect(profileRecord([m1, m2, unfinished], 'p1')).toEqual({ played: 2, won: 1 });
    expect(profileRecord([m1], 'nobody')).toEqual({ played: 0, won: 0 });
  });
});
