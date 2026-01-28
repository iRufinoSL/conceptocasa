import { isSafeUrl } from './url-utils';

/**
 * Creates a clickable phone link using tel: protocol
 * Opens the device's default calling app (FaceTime, Phone, Skype, etc.)
 */
export function PhoneLink({ phone, className }: { phone: string | null | undefined; className?: string }) {
  if (!phone) return <span className={className}>-</span>;
  
  // Clean phone number for tel: protocol (remove spaces, keep + and digits)
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  return (
    <a 
      href={`tel:${cleanPhone}`}
      className={`text-primary hover:underline cursor-pointer transition-colors ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {phone}
    </a>
  );
}

/**
 * Creates a clickable email link using mailto: protocol
 * Opens the device's default email app (Mail, Outlook, Gmail, etc.)
 */
export function EmailLink({ email, className }: { email: string | null | undefined; className?: string }) {
  if (!email) return <span className={className}>-</span>;
  
  return (
    <a 
      href={`mailto:${email}`}
      className={`hover:underline hover:text-primary transition-colors ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {email}
    </a>
  );
}

/**
 * Creates a clickable website link
 * Opens in a new tab with security attributes
 */
export function WebsiteLink({ url, className }: { url: string | null | undefined; className?: string }) {
  if (!url) return null;
  
  // Ensure URL has protocol
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;
  
  if (!isSafeUrl(fullUrl)) {
    return <span className={className}>{url}</span>;
  }
  
  return (
    <a 
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`hover:underline hover:text-primary transition-colors ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {url}
    </a>
  );
}
