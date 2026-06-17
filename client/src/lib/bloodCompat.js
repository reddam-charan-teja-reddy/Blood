export const COMPATIBILITY = {
  'O-':  ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+':  ['O+', 'A+', 'B+', 'AB+'],
  'A-':  ['A-', 'A+', 'AB-', 'AB+'],
  'A+':  ['A+', 'AB+'],
  'B-':  ['B-', 'B+', 'AB-', 'AB+'],
  'B+':  ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

// Returns donor groups that can donate to a recipient with recipientBloodGroup
export function compatibleDonorGroups(recipientBloodGroup) {
  return Object.entries(COMPATIBILITY)
    .filter(([, canDonateTo]) => canDonateTo.includes(recipientBloodGroup))
    .map(([donorGroup]) => donorGroup);
}

// Returns recipient groups that a donor with donorBloodGroup can donate to
export function compatibleRecipientGroups(donorBloodGroup) {
  return COMPATIBILITY[donorBloodGroup] || [donorBloodGroup];
}
