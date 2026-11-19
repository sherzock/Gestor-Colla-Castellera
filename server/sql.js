import { db } from '../db.js';

// Menors de 14 anys (actius) dels quals encara no s'ha apuntat el consentiment del pare, mare o tutor/a.
export const MINOR_SQL = "p.active = 1 AND p.birthdate > date('now', 'localtime', '-14 years') AND p.guardian_consent IS NULL";
export const minorsWithoutConsent = () => db.prepare(`SELECT COUNT(*) AS n FROM people p WHERE ${MINOR_SQL}`).get().n;

// Qui ha vingut de debò: el que hagi marcat l'admin o, si no ha marcat res, qui havia dit «Vinc».
export const CAME_SQL = "COALESCE(a.came, a.status = 'si', 0) = 1";
// Estat «efectiu» per muntar castells: qui no ha vingut no compta i qui ha vingut sense apuntar-se, sí.
export const EFFECTIVE_STATUS_SQL = "CASE WHEN a.came = 0 THEN 'no' WHEN a.came = 1 THEN 'si' ELSE a.status END";
