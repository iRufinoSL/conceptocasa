/**
 * Returns the standardized wall code prefix based on wall type.
 * PE = Pared Externa, PEI = Pared Externa Invisible, PEC = Pared Externa Compartida
 * PI = Pared Interna, PII = Pared Interna Invisible, PIC = Pared Interna Compartida
 * S = Suelo, T = Tejado/Techo
 */
export function getWallCodePrefix(wallType?: string | null): string {
  switch (wallType) {
    case 'exterior':
      return 'PE';
    case 'exterior_invisible':
      return 'PEI';
    case 'exterior_compartida':
      return 'PEC';
    case 'interior':
      return 'PI';
    case 'interior_invisible':
      return 'PII';
    case 'interior_compartida':
      return 'PIC';
    case 'tejado':
      return 'T';
    case 'suelo':
    case 'suelo_basico':
    case 'suelo_compartido':
    case 'suelo_invisible':
      return 'S';
    case 'techo_basico':
    case 'techo_compartido':
    case 'techo_invisible':
      return 'T';
    case 'invisible':
      return 'PEI';
    default:
      return 'PE';
  }
}

/**
 * Returns the full wall code: prefix + index number.
 * e.g. PE1, PIC2, T3, S1
 */
export function getWallCode(wallType?: string | null, index?: number): string {
  const prefix = getWallCodePrefix(wallType);
  return index != null ? `${prefix}${index}` : prefix;
}
