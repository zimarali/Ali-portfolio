// Fixed-date holidays recognised around the world. On these days the
// matching scene replaces the random pick. Test with ?date=12-25.
const DAYS = {
  '12-31': 'newyear',
  '01-01': 'newyear',
  '02-14': 'valentine',
  '10-31': 'halloween',
  '12-24': 'christmas',
  '12-25': 'christmas',
};

export const HOLIDAY_SCENES = [...new Set(Object.values(DAYS))];

/** The holiday scene id for the visitor's local date, or null. */
export function holidayToday(now = new Date()) {
  const forced = new URLSearchParams(location.search).get('date');
  let key;
  if (forced) {
    const m = forced.match(/(\d{1,2})-(\d{1,2})$/);
    if (m) key = `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  key ??= `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return DAYS[key] ?? null;
}
