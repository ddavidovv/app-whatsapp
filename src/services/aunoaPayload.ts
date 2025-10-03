import { Template, ProviderConfig } from '@/types';

interface AunoaProfile {
  [key: string]: string;
}

interface AunoaUser {
  sender: string;
  profile: AunoaProfile;
}

interface AunoaPayload {
  userslist: AunoaUser[];
}

/**
 * Builds Aunoa API payload for sending WhatsApp template messages
 * @param phone - Destination phone number (should include country code)
 * @param template - WhatsApp template object
 * @param placeholderValues - Array of placeholder values for the template
 * @param templateVariableNames - Array of variable names matching the template structure
 * @returns Aunoa API compatible payload
 */
export const buildAunoaPayload = (
  phone: string,
  template: Template,
  placeholderValues: string[],
  templateVariableNames?: string[]
): AunoaPayload => {
  // Ensure phone starts with +
  const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

  // Build profile object from placeholder values
  const profile: AunoaProfile = {};

  if (templateVariableNames && placeholderValues.length > 0) {
    // Map placeholder values to their corresponding variable names
    templateVariableNames.forEach((varName, index) => {
      if (index < placeholderValues.length) {
        profile[varName] = placeholderValues[index];
      }
    });
  }

  return {
    userslist: [
      {
        sender: formattedPhone,
        profile,
      },
    ],
  };
};

/**
 * Builds Aunoa API payload for multiple recipients
 * @param phones - Array of destination phone numbers
 * @param template - WhatsApp template object
 * @param placeholderValues - Array of placeholder values for the template
 * @param templateVariableNames - Array of variable names matching the template structure
 * @returns Aunoa API compatible payload with multiple users
 */
export const buildAunoaMultiPayload = (
  phones: string[],
  template: Template,
  placeholderValues: string[],
  templateVariableNames?: string[]
): AunoaPayload => {
  const userslist: AunoaUser[] = phones.map(phone => {
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    const profile: AunoaProfile = {};

    if (templateVariableNames && placeholderValues.length > 0) {
      templateVariableNames.forEach((varName, index) => {
        if (index < placeholderValues.length) {
          profile[varName] = placeholderValues[index];
        }
      });
    }

    return {
      sender: formattedPhone,
      profile,
    };
  });

  return {
    userslist,
  };
};
