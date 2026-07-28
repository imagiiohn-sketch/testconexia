import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, RefreshControl, Platform, Modal, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";

import { api } from "@/src/api";
import { useT } from "@/src/i18n";
import { colors, spacing, radius, font, STATUS_COLORS, RISK_COLORS, fmtMoney, fmtDate } from "@/src/theme";

const STEP_LABELS: Record<string, string> = {
  legal: "Legal", finance: "Finanzas", operations: "Operaciones", direction: "Dirección",
};

export default function ContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api.getContract(id)); } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when this detail screen regains focus (e.g. after creating an addendum)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function decide(step: string, decision: "approved" | "rejected") {
    if (!id) return;
    try { setData(await api.workflowDecision(id, step, decision)); } catch (e) { console.warn(e); }
  }
  async function sign() {
    if (!id) return;
    try { setData(await api.sign(id)); } catch (e) { console.warn(e); }
  }
  async function runAi() {
    setAiBusy(true);
    try {
      const text = aiText.trim() || `${data?.title} - ${data?.description}. Counterparty: ${data?.counterparty}. Value: ${data?.total_value} ${data?.currency}. Ends ${data?.end_date}.`;
      await api.aiAnalyze({ contract_id: id as string, contract_text: text });
      await load();
    } catch (e: any) { console.warn(e); }
    setAiBusy(false);
  }

  async function downloadOrPrint() {
    if (!id) return;
    setPdfBusy(true); setPdfErr(null);
    try {
      const html = await api.contractDocumentHtml(id as string);
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank");
        if (win) {
          setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 500);
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = `conexia-${data?.contract_number || id}.html`;
          document.body.appendChild(a); a.click(); a.remove();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: data?.title || "Contrato", UTI: "com.adobe.pdf" });
        } else {
          await Print.printAsync({ uri });
        }
      }
    } catch (e: any) {
      setPdfErr(t("detail.download.err"));
      console.warn("print", e);
    } finally {
      setPdfBusy(false);
    }
  }

  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareInfo, setShareInfo] = useState<{ url: string; title: string; num: string; counterparty: string } | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  async function confirmDelete() {
    if (!id) return;
    setDeleteBusy(true);
    try {
      await api.deleteContract(id as string);
      setDeleteOpen(false);
      router.replace("/(tabs)/contracts" as any);
    } catch (e: any) {
      console.warn(e);
    } finally { setDeleteBusy(false); }
  }

  async function openShare() {
    if (!id) return;
    setShareOpen(true);
    setShareBusy(true);
    setShareToast(null);
    try {
      const res = await api.createShareLink(id as string);
      setShareInfo({
        url: api.publicShareUrl(res.token),
        title: res.title || data?.title || "Contrato",
        num: res.contract_number || data?.contract_number || (id as string),
        counterparty: res.counterparty || data?.counterparty || "",
      });
    } catch (e: any) {
      setShareToast(t("detail.download.err"));
    } finally {
      setShareBusy(false);
    }
  }

  async function shareEmail() {
    if (!shareInfo) return;
    const subject = t("detail.share.emailSubject", { num: shareInfo.num, title: shareInfo.title });
    const body = t("detail.share.emailBody", { num: shareInfo.num, title: shareInfo.title, counterparty: shareInfo.counterparty, url: shareInfo.url });
    if (Platform.OS === "web") {
      const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, "_self");
      return;
    }
    try {
      const available = await MailComposer.isAvailableAsync();
      let attachments: string[] = [];
      try {
        const html = await api.contractDocumentHtml(id as string);
        const { uri } = await Print.printToFileAsync({ html });
        attachments = [uri];
      } catch { /* attach optional */ }
      if (available) {
        await MailComposer.composeAsync({ subject, body, attachments, isHtml: false });
      } else {
        Linking.openURL(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
      }
    } catch (e: any) {
      console.warn("mail", e);
      setShareToast(t("detail.download.err"));
    }
  }

  async function shareWhatsApp() {
    if (!shareInfo) return;
    const msg = t("detail.share.waMsg", { num: shareInfo.num, title: shareInfo.title, counterparty: shareInfo.counterparty, url: shareInfo.url });
    if (Platform.OS === "web") {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      return;
    }
    const native = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const fallback = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    try {
      const can = await Linking.canOpenURL(native);
      await Linking.openURL(can ? native : fallback);
    } catch {
      Linking.openURL(fallback);
    }
  }

  async function copyShareLink() {
    if (!shareInfo) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareInfo.url);
      } else {
        await Clipboard.setStringAsync(shareInfo.url);
      }
      setShareToast(t("detail.share.copied"));
      setTimeout(() => setShareToast(null), 2200);
    } catch (e) { console.warn(e); }
  }

  async function shareSystem() {
    if (!shareInfo) return;
    if (Platform.OS === "web") {
      // fallback to copy
      copyShareLink();
      return;
    }
    try {
      const html = await api.contractDocumentHtml(id as string);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: shareInfo.title, UTI: "com.adobe.pdf" });
      }
    } catch (e) { console.warn(e); }
  }

  if (loading || !data) {
    return <View style={[styles.root, { justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const s = STATUS_COLORS[data.status] || STATUS_COLORS.draft;
  const r = RISK_COLORS[data.risk_level] || RISK_COLORS.low;
  const progress = data.total_value > 0 ? Math.min(data.executed_value / data.total_value, 1) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="contract-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Contrato</Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable onPress={() => router.push(`/contract/${id}/edit` as any)} style={styles.printBtn} testID="edit-contract-button">
            <Ionicons name="create-outline" size={22} color={colors.brandPrimary} />
          </Pressable>
          <Pressable onPress={() => setDeleteOpen(true)} style={styles.printBtn} testID="delete-contract-button">
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
          <Pressable onPress={downloadOrPrint} disabled={pdfBusy} style={styles.printBtn} testID="download-print-button">
            {pdfBusy ? <ActivityIndicator color={colors.brandPrimary} size="small" /> : <Ionicons name="download-outline" size={22} color={colors.brandPrimary} />}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
      >
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <View style={[styles.pill, { backgroundColor: s.bg }]}><Text style={[styles.pillText, { color: s.fg }]}>{s.label.toUpperCase()}</Text></View>
          <View style={[styles.pill, { backgroundColor: r.bg }]}><Text style={[styles.pillText, { color: r.fg }]}>RIESGO {r.label.toUpperCase()}</Text></View>
        </View>
        {data.contract_number ? <Text style={styles.contractNum}>{data.contract_number}</Text> : null}
        <Text style={styles.title}>{data.title}</Text>
        {data.counterparty && data.counterparty !== data.title ? <Text style={styles.counter}>{data.counterparty}</Text> : null}
        {data.description ? <Text style={styles.desc}>{data.description}</Text> : null}

        {/* Common contract fields */}
        <View style={styles.commonGrid}>
          <CommonCell label={t("contracts.label.consultant")} value={data.consultant || "—"} />
          <CommonCell label={t("contracts.label.product")} value={data.product || "—"} />
          <CommonCell label={t("contracts.label.scheduled")} value={fmtDate(data.scheduled_date)} mono />
          <CommonCell label={t("contracts.label.delivery")} value={fmtDate(data.delivery_date || data.end_date)} mono />
          <CommonCell label={t("contracts.label.pay")} value={`${data.pay_pct || 0}%`} mono />
          <CommonCell label={t("newc.category")} value={t(`cat.${data.category || "bienes"}`)} />
        </View>
        {data.observations ? (
          <View style={styles.obsBlock}>
            <Text style={styles.obsLabel}>{t("contracts.label.observations")}</Text>
            <Text style={styles.obsText}>{data.observations}</Text>
          </View>
        ) : null}

        {/* Download/Print + Share buttons */}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Pressable style={[styles.downloadCta, { flex: 1, marginTop: 0 }]} onPress={downloadOrPrint} disabled={pdfBusy} testID="download-print-cta">
            {pdfBusy ? (
              <>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.downloadCtaText}>{t("detail.download.busy")}</Text>
              </>
            ) : (
              <>
                <Ionicons name="print-outline" size={18} color="#FFF" />
                <Text style={styles.downloadCtaText}>{t("detail.download")}</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.shareCta} onPress={openShare} testID="share-cta">
            <Ionicons name="share-social-outline" size={18} color="#FFF" />
            <Text style={styles.downloadCtaText}>{t("detail.share")}</Text>
          </Pressable>
        </View>
        {pdfErr ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 4 }}>{pdfErr}</Text> : null}

        {/* Financial KPIs */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <KpiSm label="VALOR" value={fmtMoney(data.total_value, data.currency)} />
            <KpiSm label="EJECUTADO" value={fmtMoney(data.executed_value, data.currency)} tone="success" />
            <KpiSm label="RETENCIÓN" value={fmtMoney(data.retention_value, data.currency)} tone="info" />
            <KpiSm label="MULTAS" value={fmtMoney(data.penalty_value, data.currency)} tone={data.penalty_value > 0 ? "error" : "muted"} />
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Inicio: <Text style={styles.dateValue}>{fmtDate(data.start_date)}</Text></Text>
            <Text style={styles.dateLabel}>Vence: <Text style={styles.dateValue}>{fmtDate(data.end_date)}</Text></Text>
          </View>
        </View>

        {/* Workflow */}
        <Text style={styles.sectionTitle}>Flujo de Aprobación</Text>
        <View style={styles.workflowCard}>
          {(data.workflow || []).map((step: any, i: number) => {
            const colorByStatus = step.status === "approved" ? colors.success : step.status === "rejected" ? colors.error : colors.borderStrong;
            return (
              <View key={step.step} style={styles.stepRow}>
                <View style={[styles.stepDot, { backgroundColor: colorByStatus }]}>
                  {step.status === "approved" ? <Ionicons name="checkmark" size={14} color="#FFF" /> :
                    step.status === "rejected" ? <Ionicons name="close" size={14} color="#FFF" /> :
                    <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 11 }}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepLabel}>{STEP_LABELS[step.step]}</Text>
                  <Text style={styles.stepSub}>
                    {step.status === "pending" ? "Pendiente de decisión" : `${step.status === "approved" ? "Aprobado" : "Rechazado"} por ${step.approver_name || "—"}`}
                  </Text>
                </View>
                {step.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable style={[styles.miniBtn, { backgroundColor: colors.success }]} onPress={() => decide(step.step, "approved")} testID={`approve-${step.step}`}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </Pressable>
                    <Pressable style={[styles.miniBtn, { backgroundColor: colors.error }]} onPress={() => decide(step.step, "rejected")} testID={`reject-${step.step}`}>
                      <Ionicons name="close" size={14} color="#FFF" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

          {data.status === "approved" ? (
            <Pressable style={styles.signBtn} onPress={sign} testID="sign-button">
              <Ionicons name="pencil-outline" size={16} color="#FFF" />
              <Text style={styles.signBtnText}>Aplicar Firma Electrónica (Mock eIDAS)</Text>
            </Pressable>
          ) : null}
        </View>

        {/* AI Copilot */}
        <Text style={styles.sectionTitle}>Copiloto IA</Text>
        <View style={styles.aiCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Ionicons name="sparkles-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.aiTitle}>Análisis Contractual con Claude</Text>
          </View>
          {data.ai_analysis ? (
            <View>
              <Text style={styles.aiSummary}>{data.ai_analysis.summary}</Text>
              {(data.ai_analysis.key_dates || []).length > 0 ? (
                <View style={styles.aiSub}>
                  <Text style={styles.aiSubLabel}>Fechas Clave</Text>
                  {data.ai_analysis.key_dates.slice(0, 5).map((d: any, i: number) => (
                    <Text key={i} style={styles.aiSubItem}>• {d.label}: <Text style={{ fontFamily: font.mono }}>{d.date}</Text></Text>
                  ))}
                </View>
              ) : null}
              {(data.ai_analysis.risk_clauses || []).length > 0 ? (
                <View style={styles.aiSub}>
                  <Text style={styles.aiSubLabel}>Cláusulas de Riesgo</Text>
                  {data.ai_analysis.risk_clauses.slice(0, 5).map((d: any, i: number) => (
                    <Text key={i} style={styles.aiSubItem}>• [{(d.severity || "low").toUpperCase()}] {d.clause}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.aiHint}>Genera un análisis automatizado del contrato para extraer fechas, obligaciones y cláusulas riesgosas.</Text>
          )}
          <Pressable style={styles.aiToggle} onPress={() => setShowAi(!showAi)} testID="ai-toggle">
            <Text style={styles.aiToggleText}>{showAi ? "Ocultar" : "Pegar texto del contrato (opcional)"}</Text>
            <Ionicons name={showAi ? "chevron-up" : "chevron-down"} size={14} color={colors.brandPrimary} />
          </Pressable>
          {showAi ? (
            <TextInput
              style={styles.aiInput}
              multiline
              numberOfLines={4}
              value={aiText}
              onChangeText={setAiText}
              placeholder="Pega aquí cláusulas o el texto completo..."
              placeholderTextColor={colors.onSurfaceSecondary}
              testID="ai-input"
            />
          ) : null}
          <Pressable style={styles.aiRun} onPress={runAi} disabled={aiBusy} testID="ai-run-button">
            {aiBusy ? <ActivityIndicator color="#FFF" /> : <>
              <Ionicons name="flash-outline" size={14} color="#FFF" />
              <Text style={styles.aiRunText}>Analizar con IA</Text>
            </>}
          </Pressable>
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Línea de Tiempo</Text>
        <View style={styles.timeline}>
          {(data.timeline || []).slice().reverse().map((ev: any) => (
            <View key={ev.id} style={styles.tlRow}>
              <View style={styles.tlDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlMsg}>{ev.message}</Text>
                <Text style={styles.tlMeta}>{fmtDate(ev.at)} • {ev.actor_name || "Sistema"}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Sub-modules */}
        <SubList title={t("risk.title")} items={data.risks || []} emptyKey={t("risk.empty")} render={(it) => (
          <>
            <Text style={subStyles.subTitle}>{it.risk}</Text>
            <Text style={subStyles.subMeta}>
              {t("risk.field.probability")}: {t(`level.${it.probability}`)} · {t("risk.field.impact")}: {t(`level.${it.impact}`)} · {t(`status.${it.status}`)}
            </Text>
            {it.mitigation ? <Text style={subStyles.subDesc}>↪ {it.mitigation}</Text> : null}
            {it.responsible ? <Text style={subStyles.subMeta}>👤 {it.responsible}</Text> : null}
          </>
        )} />
        <SubList title={t("mod.title")} items={data.modifications || []} emptyKey={t("mod.empty")} render={(it) => (
          <>
            <Text style={subStyles.subTitle}>{it.type} · {fmtDate(it.date)}</Text>
            <Text style={subStyles.subMeta}>Δ {fmtMoney(it.amount || 0)} · {it.days || 0}d · {t(`status.${it.approval}`)}</Text>
            {it.justification ? <Text style={subStyles.subDesc}>{it.justification}</Text> : null}
          </>
        )} />
        <SubList title={t("pay.title")} items={data.payments || []} emptyKey={t("pay.empty")} render={(it) => (
          <>
            <Text style={subStyles.subTitle}>{it.invoice} · {fmtMoney(it.amount, data.currency)}</Text>
            <Text style={subStyles.subMeta}>{fmtDate(it.date)} · {t(`status.${it.status}`)}</Text>
            {it.deliverable ? <Text style={subStyles.subDesc}>↪ {it.deliverable}</Text> : null}
          </>
        )} />
        <SubList title={t("esf.title")} items={data.esf_items || []} emptyKey={t("esf.empty")} render={(it) => (
          <>
            <Text style={subStyles.subTitle}>{it.requirement}</Text>
            <Text style={subStyles.subMeta}>{it.compliant ? "✓ " + t("yes") : "✗ " + t("no")} · {fmtDate(it.verification_date)}</Text>
            {it.observations ? <Text style={subStyles.subDesc}>{it.observations}</Text> : null}
          </>
        )} />

        {/* Addenda */}
        <Text style={styles.sectionTitle}>{t("detail.addenda")} ({(data.addenda || []).length})</Text>
        {(data.addenda || []).map((a: any) => (
          <View key={a.contract_id} style={styles.addenCard}>
            <Text style={styles.addenTitle}>{a.title}</Text>
            <Text style={styles.addenSub}>Δ {fmtMoney(a.value_delta || 0, a.currency)} • {a.end_date_delta_days >= 0 ? "+" : ""}{a.end_date_delta_days || 0} días</Text>
          </View>
        ))}
        <Pressable style={styles.addBtn} onPress={() => router.push(`/contract/${id}/addendum` as any)} testID="add-addendum-button">
          <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.addBtnText}>{t("detail.addAddendum")}</Text>
        </Pressable>
      </ScrollView>

      {/* Share modal */}
      <Modal visible={shareOpen} transparent animationType="slide" onRequestClose={() => setShareOpen(false)}>
        <Pressable style={shareStyles.backdrop} onPress={() => setShareOpen(false)} />
        <View style={shareStyles.sheet} testID="share-sheet">
          <View style={shareStyles.handle} />
          <Text style={shareStyles.title}>{t("detail.share.title")}</Text>
          {shareBusy || !shareInfo ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={shareStyles.linkBox}>
                <Ionicons name="link-outline" size={14} color={colors.brandPrimary} />
                <Text style={shareStyles.linkText} numberOfLines={1}>{shareInfo.url}</Text>
              </View>
              <Text style={shareStyles.validHint}>{t("detail.share.linkValid")}</Text>

              <Pressable style={[shareStyles.row, shareStyles.rowWa]} onPress={shareWhatsApp} testID="share-whatsapp">
                <Ionicons name="logo-whatsapp" size={22} color="#FFF" />
                <Text style={shareStyles.rowText}>{t("detail.share.whatsapp")}</Text>
              </Pressable>
              <Pressable style={[shareStyles.row, shareStyles.rowMail]} onPress={shareEmail} testID="share-email">
                <Ionicons name="mail-outline" size={20} color="#FFF" />
                <Text style={shareStyles.rowText}>{t("detail.share.email")}</Text>
              </Pressable>
              <Pressable style={[shareStyles.row, shareStyles.rowCopy]} onPress={copyShareLink} testID="share-copy">
                <Ionicons name="copy-outline" size={18} color={colors.brandPrimary} />
                <Text style={[shareStyles.rowText, { color: colors.brandPrimary }]}>{t("detail.share.copy")}</Text>
              </Pressable>
              <Pressable style={[shareStyles.row, shareStyles.rowCopy]} onPress={shareSystem} testID="share-system">
                <Ionicons name="share-social-outline" size={18} color={colors.brandPrimary} />
                <Text style={[shareStyles.rowText, { color: colors.brandPrimary }]}>{t("detail.share.system")}</Text>
              </Pressable>
              {shareToast ? <Text style={shareStyles.toast}>{shareToast}</Text> : null}
            </>
          )}
          <Pressable style={shareStyles.close} onPress={() => setShareOpen(false)} testID="share-close">
            <Text style={shareStyles.closeText}>{t("cancel")}</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Delete confirmation */}
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={shareStyles.backdrop}>
          <View style={[shareStyles.sheet, { paddingBottom: 20 }]}>
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Ionicons name="warning-outline" size={40} color={colors.error} />
              <Text style={[shareStyles.title, { color: colors.error, marginTop: 6 }]}>Eliminar contrato</Text>
              <Text style={{ color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                Esta acción es irreversible. Se eliminarán también sus adendas, evidencias y enlaces compartidos.
              </Text>
            </View>
            <Pressable style={[shareStyles.row, { backgroundColor: colors.error }]} onPress={confirmDelete} disabled={deleteBusy} testID="delete-confirm">
              {deleteBusy ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#FFF" />
                  <Text style={shareStyles.rowText}>Eliminar definitivamente</Text>
                </>
              )}
            </Pressable>
            <Pressable style={shareStyles.close} onPress={() => setDeleteOpen(false)} testID="delete-cancel">
              <Text style={shareStyles.closeText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CommonCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ width: "33.33%", padding: 4 }}>
      <Text style={{ fontSize: 9, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 0.6 }}>{label}</Text>
      <Text style={[{ fontSize: 12, color: colors.onSurface, fontWeight: "600", marginTop: 2 }, mono && { fontFamily: font.mono }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SubList({ title, items, emptyKey, render }: { title: string; items: any[]; emptyKey: string; render: (it: any) => any }) {
  return (
    <View>
      <Text style={subStyles.title}>{title} ({items.length})</Text>
      {items.length === 0 ? (
        <Text style={subStyles.empty}>{emptyKey}</Text>
      ) : items.map((it, i) => (
        <View key={it.id || i} style={subStyles.row}>{render(it)}</View>
      ))}
    </View>
  );
}

function KpiSm({ label, value, tone }: { label: string; value: string; tone?: "success" | "info" | "error" | "muted" }) {
  const map: any = { success: colors.success, info: colors.info, error: colors.error, muted: colors.onSurfaceSecondary };
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.kpiSmLabel}>{label}</Text>
      <Text style={[styles.kpiSmValue, tone ? { color: map[tone] } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  counter: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  desc: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 6 },
  contractNum: { fontFamily: font.mono, fontSize: 10, color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, marginBottom: 2 },
  commonGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  obsBlock: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary },
  obsLabel: { fontSize: 9, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 0.8 },
  obsText: { fontSize: 12, color: colors.onSurface, marginTop: 2 },
  printBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.brandTertiary },
  downloadCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandSecondary, paddingVertical: 12, borderRadius: radius.md, marginTop: spacing.lg },
  shareCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md },
  downloadCtaText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  kpiCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  kpiRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  kpiSmLabel: { fontSize: 9, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8 },
  kpiSmValue: { fontSize: 13, fontWeight: "700", fontFamily: font.mono, color: colors.onSurface, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden", marginVertical: spacing.sm },
  progressFill: { height: 6, backgroundColor: colors.brandPrimary },
  dateRow: { flexDirection: "row", justifyContent: "space-between" },
  dateLabel: { fontSize: 11, color: colors.onSurfaceSecondary },
  dateValue: { color: colors.onSurface, fontFamily: font.mono, fontWeight: "700" },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  workflowCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  stepSub: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1 },
  miniBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  signBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  signBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  aiCard: { backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary },
  aiTitle: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
  aiSummary: { fontSize: 13, color: colors.onSurface, marginBottom: 6 },
  aiSub: { marginTop: 6 },
  aiSubLabel: { fontSize: 11, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 0.6, marginBottom: 2 },
  aiSubItem: { fontSize: 12, color: colors.onSurface, marginTop: 1 },
  aiHint: { fontSize: 12, color: colors.onSurfaceSecondary, fontStyle: "italic" },
  aiToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  aiToggleText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  aiInput: { marginTop: 6, padding: spacing.sm, backgroundColor: "#FFF", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, minHeight: 80, color: colors.onSurface, textAlignVertical: "top" },
  aiRun: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, backgroundColor: colors.brandPrimary, padding: spacing.sm, borderRadius: radius.sm },
  aiRunText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  timeline: { gap: spacing.sm },
  tlRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary, marginTop: 6 },
  tlMsg: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  tlMeta: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1 },
  addenCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  addenTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  addenSub: { fontSize: 12, color: colors.onSurfaceSecondary, fontFamily: font.mono, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, borderStyle: "dashed" },
  addBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
});

const subStyles = StyleSheet.create({
  title: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { fontSize: 12, color: colors.onSurfaceSecondary, fontStyle: "italic" },
  row: { backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: colors.brandSecondary },
  subTitle: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  subMeta: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  subDesc: { fontSize: 11, color: colors.onSurface, marginTop: 4, fontStyle: "italic" },
});

const shareStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(13,20,20,0.5)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#FFF", padding: spacing.lg, paddingBottom: spacing.xl + 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 8 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  linkBox: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  linkText: { flex: 1, fontSize: 11, color: colors.onSurface, fontFamily: font.mono },
  validHint: { fontSize: 10, color: colors.onSurfaceSecondary, fontStyle: "italic", marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, marginTop: 6 },
  rowWa: { backgroundColor: "#25D366" },
  rowMail: { backgroundColor: colors.brandPrimary },
  rowCopy: { backgroundColor: colors.brandTertiary },
  rowText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  toast: { textAlign: "center", padding: 8, color: colors.success, fontSize: 12, fontWeight: "700" },
  close: { padding: 14, alignItems: "center", marginTop: spacing.sm },
  closeText: { color: colors.onSurfaceSecondary, fontWeight: "600" },
});
