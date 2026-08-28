import type {
  UserDTO,
  InstrumentDTO,
  ApplicationDTO,
  ScheduleDTO,
  CertificateDTO,
  BadgeDTO,
  DashCounts,
} from "./types";

// Roll-forward reference clock so the mock stays internally consistent:
// badge valid ~+350d (ACTIVE), schedule/preferredDate ~+7d.
const NOW = Date.now();
const days = (d: number) => new Date(NOW + d * 86400000).toISOString();

export const MOCK = {
  user: {
    id: "usr_demo_admn_trader",
    name: "Ravi Kumar",
    email: "ravi@demo.in",
    role: "TRADER",
    orgName: "Ravi Traders",
    district: "Guntur",
  } as UserDTO,

  instruments: [
    {
      id: "ins_wb_9021",
      category: "WEIGHBRIDGE",
      make: "Essae",
      model: "40t",
      serialNumber: "WB-9021",
      capacity: "40t",
      district: "Guntur",
      address: "Gandhi Nagar, Guntur",
      createdAt: days(-365),
    },
    {
      id: "ins_cs_4412",
      category: "COUNTER_SCALE",
      make: "Cas",
      model: "ER-Plus",
      serialNumber: "CS-4412",
      capacity: "150kg",
      district: "Guntur",
      address: "Main Bazaar, Guntur",
      createdAt: days(-100),
    },
    {
      id: "ins_fd_7788",
      category: "FUEL_DISPENSER",
      make: "Tokheim",
      model: "Quanta",
      serialNumber: "FD-7788",
      capacity: "single",
      district: "Krishna",
      address: "NH-16, Krishna",
      createdAt: days(-200),
    },
  ] as InstrumentDTO[],

  applications: [
    {
      id: "app_1",
      instrumentId: "ins_wb_9021",
      type: "NEW",
      status: "SUBMITTED",
      createdAt: days(-3),
    },
    {
      id: "app_2",
      instrumentId: "ins_cs_4412",
      type: "RE_VERIFICATION",
      status: "SCHEDULED",
      preferredDate: days(7),
      createdAt: days(-10),
    },
  ] as ApplicationDTO[],

  schedules: [
    {
      id: "sch_1",
      applicationId: "app_2",
      assigneeName: "LMO Guntur",
      assigneeKind: "LMO",
      scheduledFor: days(7),
      rescheduleCount: 0,
    },
  ] as ScheduleDTO[],

  certificates: [
    {
      id: "cert_1",
      certId: "PRM-CERT-2026-00001",
      status: "ACTIVE",
      validFrom: days(-15),
      validUntil: days(350),
      instrumentSerial: "WB-9021",
    },
  ] as CertificateDTO[],

  badge: {
    certId: "PRM-CERT-2026-00001",
    verdict: "VALID",
    signatureValid: true,
    anchors: [
      { label: "Instrument Serial", value: "WB-9021" },
      { label: "Owner", value: "Ravi Kumar" },
      { label: "Issued By", value: "LMO Guntur" },
      { label: "Valid Until", value: days(350) },
      { label: "Category", value: "WEIGHBRIDGE" },
    ],
    history: [
      { at: days(-15), what: "Certificate issued and notified to owner" },
      { at: days(-3), what: "Application approved after successful inspection" },
    ],
  } as BadgeDTO & { anchors: { label: string; value: string }[] },

  dash: {
    pendingApplications: 4,
    verifiedThisMonth: 12,
    expiringIn30d: 3,
    slaBreaches: 1,
  } as DashCounts,

  inspections: [
    {
      id: "insp_1",
      applicationId: "app_1",
      result: "PASS",
      observations: [
        { key: "stamp_legible", label: "Legality stamp legible & unexpired", value: true, verdict: "PASS" },
        { key: "zero_error", label: "Zero error within permissible limit at min/max load", value: true, verdict: "PASS" },
        { key: "no_tamper", label: "No tampering / broken seals", value: true, verdict: "PASS" },
        { key: "stamping_area", label: "Stamping space clean and accessible", value: true, verdict: "PASS" },
        { key: "remarks", label: "Officer remarks", value: "Within limits", verdict: "PASS" },
      ],
      photoKeys: ["insp/app_1_a.jpg", "insp/app_1_b.jpg"],
      gpsLat: 16.3067,
      gpsLng: 80.4365,
      checkedInAt: days(-2),
      inspectorName: "LMO Guntur",
    },
  ],
};