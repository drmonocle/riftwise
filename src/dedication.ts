import { tl } from "./i18n";

/** The people RiftWise was made for (shown in the footer and on the About page). */
const NAMES = ["Jatt", "Raz", "Cubby", "Jamada", "Kobe", "Kangas", "Flowers"];

export const dedication = () =>
  tl("I made RiftWise for analysts like {names}, and for any analyst, player or coach who just wants fast stats.", {
    names: NAMES.join(", "),
  });
