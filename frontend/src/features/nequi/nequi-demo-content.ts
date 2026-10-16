/**
 * Decorative content for the simulated Nequi home screen. demo/test data.
 *
 * None of these values is Andrea's real balance or a real Nequi product. The
 * COMPAS story fixtures live in `data/fixtures/demo/` and are not used for
 * this wallet decoration.
 */

export const nequiDemoUser = { firstName: "Andrea" } as const;

/** Display value only. Split so the cents can render smaller. */
export const nequiDemoBalance = {
  label: "Depósito Bajo Monto",
  whole: "$ 36.627",
  cents: ",02",
} as const;

export type NequiDemoPromo = {
  id: string;
  title: string;
  body: string;
  action: string;
};

export const nequiDemoPromos: readonly NequiDemoPromo[] = [
  {
    id: "goals",
    title: "¿Tienes una meta?",
    body: "En Nequi te ayudamos a lograrla",
    action: "Hazlo aquí",
  },
  {
    id: "mattress",
    title: "Guarda plata aparte",
    body: "Mete en el colchón lo que no quieres gastar",
    action: "Pruébalo",
  },
];
