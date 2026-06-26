import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Localization from "expo-localization";
import { storage } from "@/src/utils/storage";

type Lang = "es" | "en";

const dict = {
  es: {
    "app.name": "CONEXIA CLM",
    "app.tagline": "Contract Lifecycle Management",
    "app.subtle": "Auditable. Móvil. Enterprise.",

    "login.title": "Inicia sesión",
    "login.subtitle": "Accede a tu panel de contratos, evidencias y aprobaciones.",
    "login.tab.signin": "Iniciar sesión",
    "login.tab.signup": "Registrarse",
    "login.email": "Correo electrónico",
    "login.password": "Contraseña",
    "login.name": "Nombre completo",
    "login.department": "Departamento (opcional)",
    "login.submit.signin": "Entrar con email",
    "login.submit.signup": "Crear cuenta",
    "login.google": "Continuar con Google",
    "login.microsoft": "Continuar con Microsoft",
    "login.apple": "Continuar con Apple",
    "login.yahoo": "Continuar con Yahoo",
    "login.sso": "Iniciar sesión con SSO empresarial",
    "login.demo": "Entrar en modo demo",
    "login.provider.hint": "Requiere configuración del cliente",
    "login.divider": "o",
    "login.password.hint": "Mínimo 6 caracteres. Hash bcrypt en backend.",

    "tabs.dashboard": "Panel",
    "tabs.contracts": "Contratos",
    "tabs.evidence": "Evidencias",
    "tabs.profile": "Perfil",

    "dash.greeting": "Hola",
    "dash.kpi.title": "Indicadores Financieros",
    "dash.kpi.total": "Valor Total",
    "dash.kpi.executed": "Ejecutado",
    "dash.kpi.retention": "Retenciones",
    "dash.kpi.penalties": "Multas",
    "dash.kpi.contracts": "contratos",
    "dash.kpi.progress": "Avance acumulado",
    "dash.kpi.warranty": "Garantía 5%",
    "dash.kpi.fines": "Penalizaciones",
    "dash.semaphore.title": "Semáforo de Vencimientos",
    "dash.semaphore.empty": "Sin vencimientos próximos",
    "dash.semaphore.seeall": "Ver todo",
    "dash.pipe.title": "Pipeline de Aprobación",
    "dash.pipe.drafts": "Borradores",
    "dash.pipe.review": "En Revisión",
    "dash.pipe.active": "Activos",
    "dash.alert.critical": "ALERTA CRÍTICA",
    "dash.alert.days": "Vence en {days} días",
    "dash.recent.title": "Contratos por Categoría",
    "dash.recent.list": "Recientes",

    "contracts.title": "Contratos",
    "contracts.new": "Nuevo",
    "contracts.filter.all": "Todos",
    "contracts.empty": "Sin contratos para este filtro.",
    "contracts.label.value": "VALOR",
    "contracts.label.due": "VENCE",
    "contracts.label.consultant": "CONSULTOR",
    "contracts.label.product": "PRODUCTO",
    "contracts.label.scheduled": "PROG.",
    "contracts.label.delivery": "ENTREGA",
    "contracts.label.pay": "% PAGO",
    "contracts.label.status": "ESTADO",
    "contracts.label.observations": "OBSERVACIONES",
    "contracts.label.number": "N° CONTRATO",
    "contracts.risk": "RIESGO",

    "cat.all": "Todas",
    "cat.bienes": "Bienes",
    "cat.obras": "Obras",
    "cat.servicios_no_consultoria": "Servicios No Consultoría",
    "cat.consultor_individual": "Consultor Individual",
    "cat.firma_consultora": "Firma Consultora",
    "cat.acuerdo_marco": "Acuerdo Marco",

    "detail.tab.info": "Información",
    "detail.tab.risks": "Riesgos",
    "detail.tab.mods": "Modificaciones",
    "detail.tab.payments": "Pagos",
    "detail.tab.esf": "ESF",
    "detail.workflow": "Flujo de Aprobación",
    "detail.ai.title": "Copiloto IA",
    "detail.ai.hint": "Genera un análisis automatizado del contrato para extraer fechas, obligaciones y cláusulas riesgosas.",
    "detail.ai.run": "Analizar con IA",
    "detail.ai.toggle": "Pegar texto del contrato (opcional)",
    "detail.ai.hide": "Ocultar",
    "detail.ai.dates": "Fechas Clave",
    "detail.ai.risks": "Cláusulas de Riesgo",
    "detail.timeline": "Línea de Tiempo",
    "detail.addenda": "Adendas",
    "detail.addAddendum": "Agregar Adenda",
    "detail.sign": "Aplicar Firma Electrónica (Mock eIDAS)",
    "detail.download": "Descargar / Imprimir",
    "detail.download.busy": "Generando...",
    "detail.download.err": "No se pudo generar el documento",
    "detail.share": "Compartir",
    "detail.share.title": "Compartir contrato",
    "detail.share.email": "Enviar por Email",
    "detail.share.whatsapp": "Enviar por WhatsApp",
    "detail.share.copy": "Copiar enlace",
    "detail.share.system": "Más opciones...",
    "detail.share.copied": "Enlace copiado",
    "detail.share.linkValid": "Enlace válido 7 días",
    "detail.share.emailSubject": "Contrato {num} — {title}",
    "detail.share.emailBody": "Hola,\n\nTe comparto el contrato {title} ({num}) de {counterparty}. Puedes verlo en línea aquí:\n{url}\n\nSaludos.",
    "detail.share.waMsg": "Hola, te comparto el contrato {title} ({num}) — {counterparty}. Velo aquí: {url}",
    "detail.kpi.value": "VALOR",
    "detail.kpi.executed": "EJECUTADO",
    "detail.kpi.retention": "RETENCIÓN",
    "detail.kpi.penalty": "MULTAS",
    "detail.start": "Inicio",
    "detail.end": "Vence",
    "detail.add": "Agregar",

    "risk.title": "Riesgos",
    "risk.empty": "Sin riesgos registrados",
    "risk.field.risk": "Descripción del riesgo",
    "risk.field.probability": "Probabilidad",
    "risk.field.impact": "Impacto",
    "risk.field.mitigation": "Mitigación",
    "risk.field.responsible": "Responsable",
    "risk.field.status": "Estado",

    "mod.title": "Modificaciones",
    "mod.empty": "Sin modificaciones registradas",
    "mod.field.type": "Tipo",
    "mod.field.date": "Fecha (YYYY-MM-DD)",
    "mod.field.amount": "Monto Δ",
    "mod.field.days": "Días Δ",
    "mod.field.justification": "Justificación",
    "mod.field.approval": "Aprobación",

    "pay.title": "Pagos",
    "pay.empty": "Sin pagos registrados",
    "pay.field.invoice": "N° Factura",
    "pay.field.date": "Fecha (YYYY-MM-DD)",
    "pay.field.amount": "Monto",
    "pay.field.deliverable": "Entregable",
    "pay.field.status": "Estado",

    "esf.title": "ESF Ambiental-Social",
    "esf.empty": "Sin requisitos ESF registrados",
    "esf.field.requirement": "Requisito ESF",
    "esf.field.compliant": "Cumple",
    "esf.field.date": "Fecha verificación (YYYY-MM-DD)",
    "esf.field.observations": "Observaciones",

    "level.low": "Bajo",
    "level.medium": "Medio",
    "level.high": "Alto",
    "status.open": "Abierto",
    "status.monitoring": "Monitoreo",
    "status.closed": "Cerrado",
    "status.paid": "Pagado",
    "status.pending": "Pendiente",
    "status.rejected": "Rechazado",
    "status.approved": "Aprobado",

    "yes": "Sí",
    "no": "No",
    "save": "Guardar",
    "cancel": "Cancelar",
    "back": "Atrás",

    "evidence.title": "Evidencias",
    "evidence.subtitle": "{n} registros con GPS + timestamp inmutables",
    "evidence.empty": "Aún no hay evidencias. Toca + para registrar.",
    "evidence.new": "Nueva Evidencia",
    "evidence.helper": "Captura con metadatos inmutables: GPS + timestamp + usuario + vínculo al hito.",
    "evidence.pickImage": "Toca para capturar / elegir foto",
    "evidence.gps": "GPS",
    "evidence.gps.capture": "Capturar",
    "evidence.linked": "Contrato vinculado",
    "evidence.milestone": "Hito (opcional)",
    "evidence.note": "Nota",
    "evidence.submit": "Registrar Evidencia",
    "evidence.detail": "Evidencia",
    "evidence.label.capturedBy": "CAPTURADA POR",
    "evidence.label.date": "FECHA",
    "evidence.label.gps": "GPS",
    "evidence.label.milestone": "HITO",
    "evidence.label.hash": "HASH INMUTABLE",
    "evidence.label.note": "NOTA",
    "evidence.openContract": "Ir al contrato vinculado",

    "profile.account": "CUENTA",
    "profile.department": "Departamento",
    "profile.role": "Permisos RBAC",
    "profile.region": "Región",
    "profile.platform": "PLATAFORMA",
    "profile.notif": "Notificaciones",
    "profile.notif.value": "Email • SMS • Slack (mock)",
    "profile.esign": "Firmas Electrónicas",
    "profile.esign.value": "DocuSign / Adobe Sign (mock)",
    "profile.storage": "Almacenamiento",
    "profile.storage.value": "Cifrado AES-256 (mock)",
    "profile.language": "IDIOMA",
    "profile.help": "INSTRUCTIVO",
    "profile.help.value": "Cómo usar Conexia CLM",
    "profile.logout": "Cerrar sesión",
    "profile.footer": "CONEXIA • Software Engineering • Product Consulting",

    "instr.title": "Instructivo",
    "instr.intro": "Conexia CLM permite gestionar el ciclo de vida completo de contratos. Esta guía explica cómo registrar la información en cada módulo.",
    "instr.cat.title": "Categorías de Contrato",

    "newc.title": "Nuevo Contrato",
    "newc.category": "Categoría",
    "newc.field.title": "Título",
    "newc.field.counterparty": "Contraparte",
    "newc.field.number": "N° Contrato",
    "newc.field.consultant": "Consultor",
    "newc.field.product": "Producto",
    "newc.field.value": "Valor",
    "newc.field.currency": "Moneda",
    "newc.field.days": "Duración (días)",
    "newc.field.scheduled": "Fecha programada (YYYY-MM-DD)",
    "newc.field.delivery": "Fecha entrega (YYYY-MM-DD)",
    "newc.field.payPct": "% Pago",
    "newc.field.observations": "Observaciones",
    "newc.field.description": "Descripción",
    "newc.submit": "Crear Borrador",
    "newc.err.required": "Completa título, contraparte y valor.",

    "addn.title": "Nueva Adenda",
    "addn.helper": "Las adendas se vinculan al contrato padre y preservan el histórico (modelo Padre-Hijo).",
    "addn.field.title": "Título",
    "addn.field.desc": "Descripción",
    "addn.field.valueDelta": "Δ Valor",
    "addn.field.daysDelta": "Δ Días",
    "addn.submit": "Registrar Adenda",
    "addn.err.title": "Título requerido",
  },
  en: {
    "app.name": "CONEXIA CLM",
    "app.tagline": "Contract Lifecycle Management",
    "app.subtle": "Auditable. Mobile. Enterprise.",

    "login.title": "Sign in",
    "login.subtitle": "Access your contracts, evidence and approval panel.",
    "login.tab.signin": "Sign in",
    "login.tab.signup": "Sign up",
    "login.email": "Email",
    "login.password": "Password",
    "login.name": "Full name",
    "login.department": "Department (optional)",
    "login.submit.signin": "Sign in with email",
    "login.submit.signup": "Create account",
    "login.google": "Continue with Google",
    "login.microsoft": "Continue with Microsoft",
    "login.apple": "Continue with Apple",
    "login.yahoo": "Continue with Yahoo",
    "login.sso": "Sign in with corporate SSO",
    "login.demo": "Enter demo mode",
    "login.provider.hint": "Requires customer configuration",
    "login.divider": "or",
    "login.password.hint": "Minimum 6 characters. bcrypt hashed in backend.",

    "tabs.dashboard": "Panel",
    "tabs.contracts": "Contracts",
    "tabs.evidence": "Evidence",
    "tabs.profile": "Profile",

    "dash.greeting": "Hello",
    "dash.kpi.title": "Financial KPIs",
    "dash.kpi.total": "Total Value",
    "dash.kpi.executed": "Executed",
    "dash.kpi.retention": "Retention",
    "dash.kpi.penalties": "Penalties",
    "dash.kpi.contracts": "contracts",
    "dash.kpi.progress": "Cumulative progress",
    "dash.kpi.warranty": "5% warranty",
    "dash.kpi.fines": "Fines",
    "dash.semaphore.title": "Expiration Semaphore",
    "dash.semaphore.empty": "No upcoming expirations",
    "dash.semaphore.seeall": "See all",
    "dash.pipe.title": "Approval Pipeline",
    "dash.pipe.drafts": "Drafts",
    "dash.pipe.review": "In Review",
    "dash.pipe.active": "Active",
    "dash.alert.critical": "CRITICAL ALERT",
    "dash.alert.days": "Expires in {days} days",
    "dash.recent.title": "Contracts by Category",
    "dash.recent.list": "Recent",

    "contracts.title": "Contracts",
    "contracts.new": "New",
    "contracts.filter.all": "All",
    "contracts.empty": "No contracts for this filter.",
    "contracts.label.value": "VALUE",
    "contracts.label.due": "DUE",
    "contracts.label.consultant": "CONSULTANT",
    "contracts.label.product": "PRODUCT",
    "contracts.label.scheduled": "SCHED.",
    "contracts.label.delivery": "DELIVERY",
    "contracts.label.pay": "% PAID",
    "contracts.label.status": "STATUS",
    "contracts.label.observations": "OBSERVATIONS",
    "contracts.label.number": "CONTRACT #",
    "contracts.risk": "RISK",

    "cat.all": "All",
    "cat.bienes": "Goods",
    "cat.obras": "Works",
    "cat.servicios_no_consultoria": "Non-Consultancy Services",
    "cat.consultor_individual": "Individual Consultant",
    "cat.firma_consultora": "Consulting Firm",
    "cat.acuerdo_marco": "Framework Agreement",

    "detail.tab.info": "Info",
    "detail.tab.risks": "Risks",
    "detail.tab.mods": "Modifications",
    "detail.tab.payments": "Payments",
    "detail.tab.esf": "ESF",
    "detail.workflow": "Approval Flow",
    "detail.ai.title": "AI Copilot",
    "detail.ai.hint": "Generate an automated analysis extracting key dates, obligations and risky clauses.",
    "detail.ai.run": "Analyze with AI",
    "detail.ai.toggle": "Paste contract text (optional)",
    "detail.ai.hide": "Hide",
    "detail.ai.dates": "Key Dates",
    "detail.ai.risks": "Risk Clauses",
    "detail.timeline": "Timeline",
    "detail.addenda": "Addenda",
    "detail.addAddendum": "Add Addendum",
    "detail.sign": "Apply E-Signature (Mock eIDAS)",
    "detail.download": "Download / Print",
    "detail.download.busy": "Generating...",
    "detail.download.err": "Could not generate document",
    "detail.share": "Share",
    "detail.share.title": "Share contract",
    "detail.share.email": "Send by Email",
    "detail.share.whatsapp": "Send by WhatsApp",
    "detail.share.copy": "Copy link",
    "detail.share.system": "More options...",
    "detail.share.copied": "Link copied",
    "detail.share.linkValid": "Link valid for 7 days",
    "detail.share.emailSubject": "Contract {num} — {title}",
    "detail.share.emailBody": "Hello,\n\nSharing the contract {title} ({num}) from {counterparty}. View it online here:\n{url}\n\nBest regards.",
    "detail.share.waMsg": "Hi, sharing contract {title} ({num}) — {counterparty}. View here: {url}",
    "detail.kpi.value": "VALUE",
    "detail.kpi.executed": "EXECUTED",
    "detail.kpi.retention": "RETENTION",
    "detail.kpi.penalty": "FINES",
    "detail.start": "Start",
    "detail.end": "End",
    "detail.add": "Add",

    "risk.title": "Risks",
    "risk.empty": "No risks recorded",
    "risk.field.risk": "Risk description",
    "risk.field.probability": "Probability",
    "risk.field.impact": "Impact",
    "risk.field.mitigation": "Mitigation",
    "risk.field.responsible": "Responsible",
    "risk.field.status": "Status",

    "mod.title": "Modifications",
    "mod.empty": "No modifications recorded",
    "mod.field.type": "Type",
    "mod.field.date": "Date (YYYY-MM-DD)",
    "mod.field.amount": "Amount Δ",
    "mod.field.days": "Days Δ",
    "mod.field.justification": "Justification",
    "mod.field.approval": "Approval",

    "pay.title": "Payments",
    "pay.empty": "No payments recorded",
    "pay.field.invoice": "Invoice #",
    "pay.field.date": "Date (YYYY-MM-DD)",
    "pay.field.amount": "Amount",
    "pay.field.deliverable": "Deliverable",
    "pay.field.status": "Status",

    "esf.title": "ESF Environmental-Social",
    "esf.empty": "No ESF requirements recorded",
    "esf.field.requirement": "ESF Requirement",
    "esf.field.compliant": "Compliant",
    "esf.field.date": "Verification date (YYYY-MM-DD)",
    "esf.field.observations": "Observations",

    "level.low": "Low",
    "level.medium": "Medium",
    "level.high": "High",
    "status.open": "Open",
    "status.monitoring": "Monitoring",
    "status.closed": "Closed",
    "status.paid": "Paid",
    "status.pending": "Pending",
    "status.rejected": "Rejected",
    "status.approved": "Approved",

    "yes": "Yes",
    "no": "No",
    "save": "Save",
    "cancel": "Cancel",
    "back": "Back",

    "evidence.title": "Evidence",
    "evidence.subtitle": "{n} records with immutable GPS + timestamp",
    "evidence.empty": "No evidence yet. Tap + to record.",
    "evidence.new": "New Evidence",
    "evidence.helper": "Capture with immutable metadata: GPS + timestamp + user + milestone link.",
    "evidence.pickImage": "Tap to capture / choose photo",
    "evidence.gps": "GPS",
    "evidence.gps.capture": "Capture",
    "evidence.linked": "Linked contract",
    "evidence.milestone": "Milestone (optional)",
    "evidence.note": "Note",
    "evidence.submit": "Record Evidence",
    "evidence.detail": "Evidence",
    "evidence.label.capturedBy": "CAPTURED BY",
    "evidence.label.date": "DATE",
    "evidence.label.gps": "GPS",
    "evidence.label.milestone": "MILESTONE",
    "evidence.label.hash": "IMMUTABLE HASH",
    "evidence.label.note": "NOTE",
    "evidence.openContract": "Go to linked contract",

    "profile.account": "ACCOUNT",
    "profile.department": "Department",
    "profile.role": "RBAC permissions",
    "profile.region": "Region",
    "profile.platform": "PLATFORM",
    "profile.notif": "Notifications",
    "profile.notif.value": "Email • SMS • Slack (mock)",
    "profile.esign": "E-Signatures",
    "profile.esign.value": "DocuSign / Adobe Sign (mock)",
    "profile.storage": "Storage",
    "profile.storage.value": "AES-256 encryption (mock)",
    "profile.language": "LANGUAGE",
    "profile.help": "GUIDE",
    "profile.help.value": "How to use Conexia CLM",
    "profile.logout": "Sign out",
    "profile.footer": "CONEXIA • Software Engineering • Product Consulting",

    "instr.title": "Guide",
    "instr.intro": "Conexia CLM manages the full contract lifecycle. This guide explains what to record in each module.",
    "instr.cat.title": "Contract Categories",

    "newc.title": "New Contract",
    "newc.category": "Category",
    "newc.field.title": "Title",
    "newc.field.counterparty": "Counterparty",
    "newc.field.number": "Contract #",
    "newc.field.consultant": "Consultant",
    "newc.field.product": "Product",
    "newc.field.value": "Value",
    "newc.field.currency": "Currency",
    "newc.field.days": "Duration (days)",
    "newc.field.scheduled": "Scheduled date (YYYY-MM-DD)",
    "newc.field.delivery": "Delivery date (YYYY-MM-DD)",
    "newc.field.payPct": "% Pay",
    "newc.field.observations": "Observations",
    "newc.field.description": "Description",
    "newc.submit": "Create Draft",
    "newc.err.required": "Fill title, counterparty and value.",

    "addn.title": "New Addendum",
    "addn.helper": "Addenda link to the parent contract and preserve history (Parent-Child model).",
    "addn.field.title": "Title",
    "addn.field.desc": "Description",
    "addn.field.valueDelta": "Δ Value",
    "addn.field.daysDelta": "Δ Days",
    "addn.submit": "Record Addendum",
    "addn.err.title": "Title required",
  },
};

type Ctx = {
  lang: Lang;
  t: (k: string, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
};

const I18nCtx = createContext<Ctx>({ lang: "es", t: (k) => k, setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => { if (!cancelled) setReady(true); }, 1500);
    (async () => {
      try {
        let saved: string | null = null;
        try { saved = await storage.getItem("conexia_lang"); } catch { /* ignore */ }
        if (saved === "es" || saved === "en") {
          if (!cancelled) setLangState(saved);
        } else {
          let code = "es";
          try {
            if (Platform.OS === "web") {
              code = (typeof navigator !== "undefined" && navigator.language && navigator.language.toLowerCase().startsWith("en")) ? "en" : "es";
            } else {
              const locales = Localization.getLocales?.();
              if (locales && locales.length > 0) {
                code = (locales[0].languageCode || "es").toLowerCase().startsWith("en") ? "en" : "es";
              }
            }
          } catch { /* ignore */ }
          if (!cancelled) setLangState(code === "en" ? "en" : "es");
        }
      } finally {
        if (!cancelled) {
          clearTimeout(timeout);
          setReady(true);
        }
      }
    })();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setItem("conexia_lang", l).catch(() => { /* ignore */ });
  }, []);

  const t = useCallback((k: string, vars?: Record<string, string | number>) => {
    const d = (dict[lang] as Record<string, string>);
    let s = d[k] ?? (dict.es as Record<string, string>)[k] ?? k;
    if (vars) {
      for (const [vk, vv] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${vk}\\}`, "g"), String(vv));
      }
    }
    return s;
  }, [lang]);

  if (!ready) {
    // While bootstrapping, render with defaults so the UI never freezes on a blank screen.
    return <I18nCtx.Provider value={{ lang: "es", t: (k) => (dict.es as Record<string, string>)[k] ?? k, setLang }}>{children}</I18nCtx.Provider>;
  }
  return <I18nCtx.Provider value={{ lang, t, setLang }}>{children}</I18nCtx.Provider>;
}

export function useT() { return useContext(I18nCtx); }
