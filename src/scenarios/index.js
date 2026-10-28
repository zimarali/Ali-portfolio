// Scene registry. To add a scene: create a class extending Scene in this
// folder and list it here — the picker and controls pick it up automatically.
// Scenes marked `static holiday = true` stay out of the shuffle and only
// appear on their day (see src/holidays.js).
import { Christmas } from './christmas.js';
import { City } from './city.js';
import { Cyberpunk } from './cyberpunk.js';
import { Delivery } from './delivery.js';
import { Desktop } from './desktop.js';
import { Dominoes } from './dominoes.js';
import { Forest } from './forest.js';
import { Halloween } from './halloween.js';
import { Inflatables } from './inflatables.js';
import { NewYear } from './newyear.js';
import { Popup } from './popup.js';
import { Shore } from './shore.js';
import { Valentine } from './valentine.js';
import { Workshop } from './workshop.js';

export const SCENES = {
  delivery: Delivery,
  inflatables: Inflatables,
  dominoes: Dominoes,
  workshop: Workshop,
  shore: Shore,
  popup: Popup,
  desktop: Desktop,
  cyberpunk: Cyberpunk,
  forest: Forest,
  city: City,
  // Holidays
  newyear: NewYear,
  valentine: Valentine,
  halloween: Halloween,
  christmas: Christmas,
};

/** Scenes in the everyday shuffle. */
export const EVERYDAY = Object.keys(SCENES).filter((id) => !SCENES[id].holiday);
