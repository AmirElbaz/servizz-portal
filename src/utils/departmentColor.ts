// Accent color for department cards.
//
// The Centrecom 2025 brand guidelines have exactly one brand hue — Centrecom
// Blue — plus a grey support set. Hashing departments across a mixed
// blue+grey palette makes card rows look accidentally skewed ("one blue,
// three greys"), which reads as broken rather than intentional.
//
// Cards are now all anchored to the Centrecom Blue. Icons, names, and copy
// are what differentiate them — not hash-picked color assignments.
//
// The function and its signature are kept (vs deleted and inlined) so a
// future decision to introduce per-department tints via shades of blue can
// land without changing every caller.

export function departmentColorHex(_code: string): string {
  return "#2eb2ff";
}
