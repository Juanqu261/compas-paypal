export type Act = 1 | 2 | 3;

export type Chapter = {
  act: Act;
  title: string;
  /** What the viewer should do now, said as a hint when the act opens. */
  move: string;
};

/** The demo as a story: each act is one thing COMPAS does. */
export const CHAPTERS: readonly Chapter[] = [
  {
    act: 1,
    title: "Before anyone buys",
    move: "Pick a pharmacy, then press “Run the analyst”.",
  },
  {
    act: 2,
    title: "The purchase",
    move: "On Pedro’s phone, open COMPAS and make a budget. Then charge it from the pharmacy’s phone.",
  },
  {
    act: 3,
    title: "When an AI shops",
    move: "Press “Watch an agent do the errand”, then answer as Andrea when it asks.",
  },
];

export const ACTS: readonly Act[] = [1, 2, 3];

export function chapterOf(act: Act): Chapter {
  return CHAPTERS[act - 1];
}
