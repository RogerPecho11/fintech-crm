import { initializeDatabase, query } from './connection';

async function updateMerchants() {
  await initializeDatabase();

  // Get users for assignment
  const users = await query(`SELECT id, role FROM users WHERE is_active = true`);
  const admin      = users.find((u: any) => u.role === 'admin')?.id;
  const commercial = users.find((u: any) => u.role === 'commercial')?.id;
  const onboarding = users.find((u: any) => u.role === 'onboarding')?.id;
  const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

  // ── Payment method templates ──────────────────────────────────────────────
  const pePayIn = [
    { method_id: 'card_visa', method_name: 'Visa', provider: 'Niubiz', commission: '3.5', fee: '0.30', min_fee: '0.50', currency: 'PEN' },
    { method_id: 'card_mc',   method_name: 'Mastercard', provider: 'Niubiz', commission: '3.5', fee: '0.30', min_fee: '0.50', currency: 'PEN' },
    { method_id: 'wallet_yape', method_name: 'Yape', provider: 'BCP', commission: '1.5', fee: '0.10', min_fee: '0.20', currency: 'PEN' },
    { method_id: 'cash_pe',   method_name: 'PagoEfectivo', provider: 'PagoEfectivo SAC', commission: '2.0', fee: '0.50', min_fee: '1.00', currency: 'PEN' },
  ];
  const pePayOut = [
    { method_id: 'bank_transfer', method_name: 'Transferencia Bancaria', provider: 'BCP', commission: '0.5', fee: '1.50', min_fee: '1.50', currency: 'PEN' },
    { method_id: 'wallet_plin',   method_name: 'Plin', provider: 'Interbank', commission: '0.8', fee: '0.20', min_fee: '0.20', currency: 'PEN' },
  ];
  const clPayIn = [
    { method_id: 'card_visa', method_name: 'Visa', provider: 'Transbank', commission: '2.95', fee: '0.00', min_fee: '0.00', currency: 'CLP' },
    { method_id: 'card_mc',   method_name: 'Mastercard', provider: 'Transbank', commission: '2.95', fee: '0.00', min_fee: '0.00', currency: 'CLP' },
    { method_id: 'cash_cl',   method_name: 'Klap', provider: 'Klap Chile', commission: '1.8', fee: '500', min_fee: '500', currency: 'CLP' },
  ];
  const clPayOut = [
    { method_id: 'bank_transfer', method_name: 'Transferencia Bancaria', provider: 'Banco de Chile', commission: '0.3', fee: '1000', min_fee: '1000', currency: 'CLP' },
    { method_id: 'wallet_mach',   method_name: 'MACH', provider: 'BCI', commission: '0.5', fee: '200', min_fee: '200', currency: 'CLP' },
  ];
  const ecPayIn = [
    { method_id: 'card_visa', method_name: 'Visa', provider: 'Datafast', commission: '3.2', fee: '0.25', min_fee: '0.50', currency: 'USD' },
    { method_id: 'card_mc',   method_name: 'Mastercard', provider: 'Datafast', commission: '3.2', fee: '0.25', min_fee: '0.50', currency: 'USD' },
    { method_id: 'cash_ec',   method_name: 'Efectivo Ecuador', provider: 'Pago Ágil', commission: '2.5', fee: '0.50', min_fee: '1.00', currency: 'USD' },
  ];
  const ecPayOut = [
    { method_id: 'bank_transfer', method_name: 'Transferencia Bancaria', provider: 'Banco Pichincha', commission: '0.4', fee: '0.75', min_fee: '0.75', currency: 'USD' },
  ];

  const pay4uPE = { amount_over_fee: '2.50', currency: 'PEN', amount_between_fee: '1.80', has_tax: true };
  const pay4uCL = { amount_over_fee: '1500', currency: 'CLP', amount_between_fee: '1000', has_tax: true };
  const pay4uEC = { amount_over_fee: '1.50', currency: 'USD', amount_between_fee: '1.00', has_tax: false };

  // ── Merchant update data ──────────────────────────────────────────────────
  const updates = [
    {
      legal_name: 'Supermercados La Canasta S.A.C.',
      extra: {
        request_type: 'Nuevo Comercio',
        merchant_email: 'pagos@lacanasta.com.pe',
        merchant_user: 'lacanasta_pe',
        report_email: 'reportes@lacanasta.com.pe',
        has_iva: 'yes',
        accepts_third_party: 'no',
        communication_channel: 'Email',
        category: 'Supermercado',
        origin_country: 'PE',
        risk_level: 'gold',
        payment_methods_detail: [
          { country_code: 'PE', country_name: 'Perú', pay_in: pePayIn, pay_out: pePayOut, pay4u: pay4uPE },
        ],
      },
    },
    {
      legal_name: 'TechSolutions Chile SpA',
      extra: {
        request_type: 'Ampliación de Servicios',
        merchant_email: 'billing@techsol.cl',
        merchant_user: 'techsol_cl',
        report_email: 'finance@techsol.cl',
        has_iva: 'yes',
        accepts_third_party: 'yes',
        communication_channel: 'Slack',
        category: 'Software B2B',
        origin_country: 'CL',
        risk_level: 'diamond',
        payment_methods_detail: [
          { country_code: 'CL', country_name: 'Chile', pay_in: clPayIn, pay_out: clPayOut, pay4u: pay4uCL },
        ],
      },
    },
    {
      legal_name: 'Restaurantes El Sabor Ecuatoriano Cía. Ltda.',
      extra: {
        request_type: 'Nuevo Comercio',
        merchant_email: 'admin@elsabor.ec',
        merchant_user: 'elsabor_ec',
        report_email: 'contabilidad@elsabor.ec',
        has_iva: 'yes',
        accepts_third_party: 'no',
        communication_channel: 'WhatsApp',
        category: 'Restaurante Casual',
        origin_country: 'EC',
        risk_level: 'silver',
        payment_methods_detail: [
          { country_code: 'EC', country_name: 'Ecuador', pay_in: ecPayIn, pay_out: ecPayOut, pay4u: pay4uEC },
        ],
      },
    },
    {
      legal_name: 'Farmacia Salud Total S.A.',
      extra: {
        request_type: 'Nuevo Comercio',
        merchant_email: 'ventas@saludtotal.pe',
        merchant_user: 'saludtotal_pe',
        report_email: 'admin@saludtotal.pe',
        has_iva: 'no',
        accepts_third_party: 'no',
        communication_channel: 'Teléfono',
        category: 'Farmacia Retail',
        origin_country: 'PE',
        risk_level: 'silver',
        payment_methods_detail: [
          {
            country_code: 'PE', country_name: 'Perú',
            pay_in: [pePayIn[0], pePayIn[1], pePayIn[2]],
            pay_out: [pePayOut[0]],
            pay4u: pay4uPE,
          },
        ],
      },
    },
    {
      legal_name: 'Importadora Andina Chile S.A.',
      extra: {
        request_type: 'Migración',
        merchant_email: 'pagos@andinaimport.cl',
        merchant_user: 'andina_cl',
        report_email: 'finanzas@andinaimport.cl',
        has_iva: 'yes',
        accepts_third_party: 'yes',
        communication_channel: 'Email',
        category: 'Importadora B2B',
        origin_country: 'CL',
        risk_level: 'bronze',
        payment_methods_detail: [
          {
            country_code: 'CL', country_name: 'Chile',
            pay_in: [clPayIn[0], clPayIn[1]],
            pay_out: [clPayOut[0]],
            pay4u: pay4uCL,
          },
        ],
      },
    },
    {
      legal_name: 'Tienda Online Moda EC S.A.S.',
      extra: {
        request_type: 'Nuevo Comercio',
        merchant_email: 'hola@modaec.com',
        merchant_user: 'modaec',
        report_email: 'reportes@modaec.com',
        has_iva: 'no',
        accepts_third_party: 'yes',
        communication_channel: 'WhatsApp',
        category: 'Moda Online',
        origin_country: 'EC',
        risk_level: 'gold',
        payment_methods_detail: [
          {
            country_code: 'EC', country_name: 'Ecuador',
            pay_in: ecPayIn,
            pay_out: ecPayOut,
            pay4u: pay4uEC,
          },
        ],
      },
    },
    {
      legal_name: 'Constructora Pacífico S.A.C.',
      extra: {
        request_type: 'Renovación',
        merchant_email: 'pagos@pacificoconstruye.pe',
        merchant_user: 'pacifico_pe',
        report_email: 'contabilidad@pacificoconstruye.pe',
        has_iva: 'yes',
        accepts_third_party: 'no',
        communication_channel: 'Email',
        category: 'Construcción e Inmobiliaria',
        origin_country: 'PE',
        risk_level: 'bronze',
        payment_methods_detail: [
          {
            country_code: 'PE', country_name: 'Perú',
            pay_in: [pePayIn[0], pePayIn[1]],
            pay_out: [pePayOut[0]],
            pay4u: pay4uPE,
          },
        ],
      },
    },
    {
      legal_name: 'Hotel Boutique Viña del Mar S.A.',
      extra: {
        request_type: 'Ampliación de Servicios',
        merchant_email: 'reservas@hotelpacificovina.cl',
        merchant_user: 'hotelpacificovina',
        report_email: 'administracion@hotelpacificovina.cl',
        has_iva: 'yes',
        accepts_third_party: 'yes',
        communication_channel: 'Teams',
        category: 'Hotel Boutique',
        origin_country: 'CL',
        risk_level: 'gold',
        payment_methods_detail: [
          {
            country_code: 'CL', country_name: 'Chile',
            pay_in: clPayIn,
            pay_out: clPayOut,
            pay4u: pay4uCL,
          },
        ],
      },
    },
    {
      legal_name: 'Clínica Dental Sonrisa Perfecta S.R.L.',
      extra: {
        request_type: 'Nuevo Comercio',
        merchant_email: 'info@sonrisaperfecta.ec',
        merchant_user: 'sonrisaperfecta',
        report_email: 'admin@sonrisaperfecta.ec',
        has_iva: 'no',
        accepts_third_party: 'no',
        communication_channel: 'Teléfono',
        category: 'Clínica Dental',
        origin_country: 'EC',
        risk_level: 'silver',
        payment_methods_detail: [
          {
            country_code: 'EC', country_name: 'Ecuador',
            pay_in: [ecPayIn[0], ecPayIn[1]],
            pay_out: [ecPayOut[0]],
            pay4u: pay4uEC,
          },
        ],
      },
    },
    {
      legal_name: 'Distribuidora Norte S.A.C.',
      extra: {
        request_type: 'Ampliación de Servicios',
        merchant_email: 'ventas@distrinorte.pe',
        merchant_user: 'distrinorte_pe',
        report_email: 'reportes@distrinorte.pe',
        has_iva: 'yes',
        accepts_third_party: 'yes',
        communication_channel: 'Slack',
        category: 'Distribución Tecnología',
        origin_country: 'PE',
        risk_level: 'silver',
        payment_methods_detail: [
          {
            country_code: 'PE', country_name: 'Perú',
            pay_in: pePayIn,
            pay_out: pePayOut,
            pay4u: pay4uPE,
          },
        ],
      },
    },
    {
      legal_name: 'INGUS BRIDGE PERU S.A.C.',
      extra: {
        request_type: 'Nuevo Comercio',
        merchant_email: 'pagos@juegaenlinea.pe',
        merchant_user: 'juegaenlinea_pe',
        report_email: 'finanzas@juegaenlinea.pe',
        has_iva: 'yes',
        accepts_third_party: 'yes',
        communication_channel: 'WhatsApp',
        category: 'Gaming / Entretenimiento',
        origin_country: 'PE',
        risk_level: 'bronze',
        payment_methods_detail: [
          {
            country_code: 'PE', country_name: 'Perú',
            pay_in: pePayIn,
            pay_out: pePayOut,
            pay4u: pay4uPE,
          },
        ],
      },
    },
  ];

  console.log('🔄 Actualizando información de comercios...\n');

  for (const upd of updates) {
    const merchants = await query(
      `SELECT id FROM merchants WHERE legal_name = $1`,
      [upd.legal_name]
    );

    if (merchants.length === 0) {
      console.log(`  ⚠️  No encontrado: ${upd.legal_name}`);
      continue;
    }

    const merchantId = merchants[0].id;
    const e = upd.extra;

    await query(
      `UPDATE merchants SET
        payment_methods_detail = $1,
        risk_level             = $2,
        notes                  = COALESCE(notes, ''),
        last_activity_at       = NOW() - (random() * interval '5 days'),
        updated_at             = NOW()
       WHERE id = $3`,
      [
        JSON.stringify(e.payment_methods_detail),
        // Map new risk labels to existing DB enum values
        ({ diamond: 'low', gold: 'low', silver: 'medium', bronze: 'high' } as any)[e.risk_level] || 'medium',
        merchantId,
      ]
    );

    // Store extra fields as a JSON comment in notes (since DB schema doesn't have these columns yet)
    // We'll store them as a structured note prefix that the frontend can parse
    const extraNote = JSON.stringify({
      _meta: true,
      request_type: e.request_type,
      merchant_email: e.merchant_email,
      merchant_user: e.merchant_user,
      report_email: e.report_email,
      has_iva: e.has_iva,
      accepts_third_party: e.accepts_third_party,
      communication_channel: e.communication_channel,
      category: e.category,
      origin_country: e.origin_country,
      risk_label: e.risk_level,  // store display label (diamond/gold/silver/bronze)
    });

    // Update notes to include meta (preserve existing notes)
    const existing = await query(`SELECT notes FROM merchants WHERE id = $1`, [merchantId]);
    const currentNotes = existing[0]?.notes || '';
    // Remove old _meta block if exists
    const cleanNotes = currentNotes.replace(/\{\"_meta\":true[^}]*\}/g, '').trim();
    const newNotes = extraNote + (cleanNotes ? '\n' + cleanNotes : '');

    await query(`UPDATE merchants SET notes = $1 WHERE id = $2`, [newNotes, merchantId]);

    console.log(`  ✅ ${upd.legal_name} → riesgo: ${e.risk_level} | ${e.payment_methods_detail.length} país(es) configurado(s)`);
  }

  console.log('\n✅ Todos los comercios actualizados');
  process.exit(0);
}

updateMerchants().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
