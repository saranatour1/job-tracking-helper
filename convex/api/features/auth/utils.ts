// scripts/dev.sh sets "disabled" so dev can push without real OAuth apps.
export const configured = (...names: string[]): boolean =>
  names.every((name) => ![undefined, "", "disabled"].includes(process.env[name]))
