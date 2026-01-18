import DOMPurify from 'dompurify';

// Email validation regex
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Spanish phone number regex (with or without country code)
const PHONE_REGEX = /^(\+34\s?)?[6789]\d{2}\s?\d{3}\s?\d{3}$/;

// Spanish NIF/NIE regex
// NIF: 8 digits + letter (e.g., 12345678A)
// NIE: X/Y/Z + 7 digits + letter (e.g., X1234567A)
// CIF: Letter + 7 digits + letter/digit (e.g., B12345678)
const NIF_DNI_REGEX = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J])$/i;

// Spanish postal code regex (5 digits, first two between 01-52)
const POSTAL_CODE_REGEX = /^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/;

// URL regex (simplified, allows common patterns)
const URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates an email address format
 */
export function validateEmail(email: string | null | undefined): ValidationResult {
  if (!email || email.trim() === '') {
    return { isValid: true }; // Empty is valid (field is optional)
  }
  
  const sanitized = DOMPurify.sanitize(email.trim());
  if (sanitized !== email.trim()) {
    return { isValid: false, error: 'El email contiene caracteres no permitidos' };
  }
  
  if (email.length > 254) {
    return { isValid: false, error: 'El email es demasiado largo (máximo 254 caracteres)' };
  }
  
  if (!EMAIL_REGEX.test(email.trim())) {
    return { isValid: false, error: 'El formato del email no es válido' };
  }
  
  return { isValid: true };
}

/**
 * Validates a Spanish phone number format
 */
export function validatePhone(phone: string | null | undefined): ValidationResult {
  if (!phone || phone.trim() === '' || phone.trim() === '+34' || phone.trim() === '+34 ') {
    return { isValid: true }; // Empty or default is valid
  }
  
  const sanitized = DOMPurify.sanitize(phone.trim());
  if (sanitized !== phone.trim()) {
    return { isValid: false, error: 'El teléfono contiene caracteres no permitidos' };
  }
  
  // Remove spaces for validation
  const cleanPhone = phone.replace(/\s/g, '');
  
  if (cleanPhone.length > 15) {
    return { isValid: false, error: 'El teléfono es demasiado largo' };
  }
  
  // More flexible validation - just ensure it contains only valid characters
  if (!/^[+0-9\s()-]+$/.test(phone)) {
    return { isValid: false, error: 'El teléfono contiene caracteres no válidos' };
  }
  
  return { isValid: true };
}

/**
 * Validates a Spanish NIF/NIE/CIF format
 */
export function validateNifDni(nifDni: string | null | undefined): ValidationResult {
  if (!nifDni || nifDni.trim() === '') {
    return { isValid: true }; // Empty is valid
  }
  
  const sanitized = DOMPurify.sanitize(nifDni.trim());
  if (sanitized !== nifDni.trim()) {
    return { isValid: false, error: 'El NIF/DNI contiene caracteres no permitidos' };
  }
  
  // Remove spaces and hyphens
  const cleanNif = nifDni.replace(/[\s-]/g, '').toUpperCase();
  
  if (cleanNif.length > 15) {
    return { isValid: false, error: 'El NIF/DNI es demasiado largo' };
  }
  
  if (!NIF_DNI_REGEX.test(cleanNif)) {
    return { isValid: false, error: 'El formato del NIF/DNI no es válido' };
  }
  
  return { isValid: true };
}

/**
 * Validates a Spanish postal code
 */
export function validatePostalCode(postalCode: string | null | undefined): ValidationResult {
  if (!postalCode || postalCode.trim() === '') {
    return { isValid: true }; // Empty is valid
  }
  
  const sanitized = DOMPurify.sanitize(postalCode.trim());
  if (sanitized !== postalCode.trim()) {
    return { isValid: false, error: 'El código postal contiene caracteres no permitidos' };
  }
  
  if (!POSTAL_CODE_REGEX.test(postalCode.trim())) {
    return { isValid: false, error: 'El código postal debe tener 5 dígitos válidos (01000-52999)' };
  }
  
  return { isValid: true };
}

/**
 * Validates a website URL
 */
export function validateWebsite(website: string | null | undefined): ValidationResult {
  if (!website || website.trim() === '') {
    return { isValid: true }; // Empty is valid
  }
  
  const sanitized = DOMPurify.sanitize(website.trim());
  if (sanitized !== website.trim()) {
    return { isValid: false, error: 'La URL contiene caracteres no permitidos' };
  }
  
  if (website.length > 2048) {
    return { isValid: false, error: 'La URL es demasiado larga' };
  }
  
  // Check for javascript: or data: URLs (XSS vectors)
  const lowerUrl = website.toLowerCase().trim();
  if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:')) {
    return { isValid: false, error: 'URL no permitida por razones de seguridad' };
  }
  
  if (!URL_REGEX.test(website.trim())) {
    return { isValid: false, error: 'El formato de la URL no es válido' };
  }
  
  return { isValid: true };
}

/**
 * Validates a general text field (sanitizes and checks length)
 */
export function validateTextField(
  text: string | null | undefined, 
  fieldName: string,
  maxLength: number = 500
): ValidationResult {
  if (!text || text.trim() === '') {
    return { isValid: true };
  }
  
  const sanitized = DOMPurify.sanitize(text.trim());
  if (sanitized !== text.trim()) {
    return { isValid: false, error: `${fieldName} contiene caracteres no permitidos` };
  }
  
  if (text.length > maxLength) {
    return { isValid: false, error: `${fieldName} es demasiado largo (máximo ${maxLength} caracteres)` };
  }
  
  return { isValid: true };
}

/**
 * Sanitizes a string by removing potentially dangerous content
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input) return '';
  return DOMPurify.sanitize(input.trim());
}

/**
 * Validates all contact fields at once
 */
export function validateContactData(data: {
  name: string;
  surname?: string;
  email?: string;
  phone?: string;
  secondary_phones?: string[];
  secondary_emails?: string[];
  nif_dni?: string;
  postal_code?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  observations?: string;
}): ValidationResult {
  // Name is required
  if (!data.name || data.name.trim() === '') {
    return { isValid: false, error: 'El nombre es obligatorio' };
  }
  
  const nameValidation = validateTextField(data.name, 'Nombre', 200);
  if (!nameValidation.isValid) return nameValidation;
  
  const surnameValidation = validateTextField(data.surname, 'Apellido', 200);
  if (!surnameValidation.isValid) return surnameValidation;
  
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) return emailValidation;
  
  const phoneValidation = validatePhone(data.phone);
  if (!phoneValidation.isValid) return phoneValidation;
  
  // Validate secondary phones
  if (data.secondary_phones) {
    for (const phone of data.secondary_phones) {
      const validation = validatePhone(phone);
      if (!validation.isValid) {
        return { isValid: false, error: `Teléfono secundario: ${validation.error}` };
      }
    }
  }
  
  // Validate secondary emails
  if (data.secondary_emails) {
    for (const email of data.secondary_emails) {
      const validation = validateEmail(email);
      if (!validation.isValid) {
        return { isValid: false, error: `Email secundario: ${validation.error}` };
      }
    }
  }
  
  const nifValidation = validateNifDni(data.nif_dni);
  if (!nifValidation.isValid) return nifValidation;
  
  const postalValidation = validatePostalCode(data.postal_code);
  if (!postalValidation.isValid) return postalValidation;
  
  const websiteValidation = validateWebsite(data.website);
  if (!websiteValidation.isValid) return websiteValidation;
  
  const addressValidation = validateTextField(data.address, 'Dirección', 500);
  if (!addressValidation.isValid) return addressValidation;
  
  const cityValidation = validateTextField(data.city, 'Ciudad', 100);
  if (!cityValidation.isValid) return cityValidation;
  
  const provinceValidation = validateTextField(data.province, 'Provincia', 100);
  if (!provinceValidation.isValid) return provinceValidation;
  
  const countryValidation = validateTextField(data.country, 'País', 100);
  if (!countryValidation.isValid) return countryValidation;
  
  const observationsValidation = validateTextField(data.observations, 'Observaciones', 5000);
  if (!observationsValidation.isValid) return observationsValidation;
  
  return { isValid: true };
}
