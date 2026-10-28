// Chooses which scene plays. A shuffled "bag" is kept in localStorage so
// returning visitors work through every scene before seeing a repeat.
const KEY = 'ramiz-ali:scene-bag:v1';

function shuffle(ids, avoidFirst) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.length > 1 && a[0] === avoidFirst) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && Array.isArray(v.bag) ? v : null;
  } catch {
    return null;
  }
}

function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: memory only */ }
}

export class ScenePicker {
  constructor(ids) {
    this.ids = ids;
    const saved = read();
    this.state = { bag: saved?.bag.filter((id) => ids.includes(id)) ?? [], last: saved?.last ?? null };
  }

  next() {
    if (!this.state.bag.length) this.state.bag = shuffle(this.ids, this.state.last);
    const id = this.state.bag.shift();
    this.state.last = id;
    write(this.state);
    return id;
  }

  /** Records an explicitly requested scene (e.g. ?scene=) without breaking the cycle. */
  mark(id) {
    this.state.bag = this.state.bag.filter((x) => x !== id);
    this.state.last = id;
    write(this.state);
  }
}
