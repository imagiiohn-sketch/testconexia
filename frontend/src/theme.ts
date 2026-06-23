import { Platform } from "react-native";

export const colors = {
  surface: "#FFFFFF",
  onSurface: "#0D1414",
  surfaceSecondary: "#F4F6F6",
  onSurfaceSecondary: "#465454",
  surfaceTertiary: "#E7EBEB",
  onSurfaceTertiary: "#2E3B3B",
  surfaceInverse: "#1F2B2B",
  onSurfaceInverse: "#FFFFFF",
  brand: "#1F4A4A",
  brandPrimary: "#1F4A4A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#346B6B",
  brandTertiary: "#E2ECEC",
  onBrandTertiary: "#1F4A4A",
  success: "#228B22",
  warning: "#E67300",
  error: "#D32F2F",
  info: "#005B9F",
  border: "#D8E0E0",
  borderStrong: "#9DB5B5",
  divider: "#E7EBEB",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const font = {
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string,
};

export const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#E7EBEB", fg: "#2E3B3B", label: "Borrador" },
  in_review: { bg: "#FFE8CC", fg: "#A14A00", label: "En Revisión" },
  approved: { bg: "#D6E9FF", fg: "#003E78", label: "Aprobado" },
  signed: { bg: "#E2ECEC", fg: "#1F4A4A", label: "Firmado" },
  active: { bg: "#D6F5D6", fg: "#176B17", label: "Activo" },
  expiring: { bg: "#FFD9D9", fg: "#8C1F1F", label: "Por Vencer" },
  closed: { bg: "#E7EBEB", fg: "#465454", label: "Cerrado" },
};

export const RISK_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  low: { bg: "#D6F5D6", fg: "#176B17", label: "Bajo" },
  medium: { bg: "#FFE8CC", fg: "#A14A00", label: "Medio" },
  high: { bg: "#FFD9D9", fg: "#8C1F1F", label: "Alto" },
};

export function fmtMoney(value: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${currency} ${Math.round(value || 0).toLocaleString()}`;
  }
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
