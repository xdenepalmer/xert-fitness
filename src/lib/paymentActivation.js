const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inspectPaymentActivationReceipt(
  settingsRows,
  settingsError,
  auditRows = [],
  auditError = null,
) {
  if (settingsError || !Array.isArray(settingsRows) || settingsRows.length !== 1) {
    return {
      payment_switch: { ready: false, state: 'unknown', updated_at: null },
      activation_receipt: {
        required: false, ready: false, activated_at: null, actor_recorded: false,
        issue: 'Platform payment settings could not be verified.',
      },
    };
  }
  const settings = settingsRows[0];
  if (!UUID_PATTERN.test(String(settings?.id || ''))
      || typeof settings?.bookings_enabled !== 'boolean'
      || typeof settings?.payments_enabled !== 'boolean') {
    return {
      payment_switch: { ready: false, state: 'invalid', updated_at: null },
      activation_receipt: {
        required: false, ready: false, activated_at: null, actor_recorded: false,
        issue: 'Platform payment settings are invalid.',
      },
    };
  }

  const updatedAt = String(settings.updated_at || '');
  const versionTime = Date.parse(updatedAt);
  const state = settings.payments_enabled ? 'enabled' : 'paused';
  const paymentSwitch = {
    ready: Number.isFinite(versionTime),
    state,
    updated_at: Number.isFinite(versionTime) ? new Date(versionTime).toISOString() : null,
  };
  if (!settings.payments_enabled) {
    return {
      payment_switch: paymentSwitch,
      activation_receipt: {
        required: false, ready: true, activated_at: null, actor_recorded: false, issue: null,
      },
    };
  }
  if (!settings.bookings_enabled) {
    return {
      payment_switch: {
        ready: false,
        state: 'unsafe',
        updated_at: paymentSwitch.updated_at,
      },
      activation_receipt: {
        required: true,
        ready: false,
        activated_at: null,
        actor_recorded: false,
        issue: 'Session-pack checkout is enabled while member bookings are paused.',
      },
    };
  }

  const matchingReceipt = !auditError && Array.isArray(auditRows)
    ? auditRows.find(row => (
        row?.resource_id === settings.id
        && row?.action === 'updated'
        && UUID_PATTERN.test(String(row?.changed_by || ''))
        && row?.previous_snapshot?.payments_enabled === false
        && row?.new_snapshot?.payments_enabled === true
        && Number.isFinite(versionTime)
        && Date.parse(String(row?.new_snapshot?.updated_at || '')) === versionTime
        && Number.isFinite(Date.parse(String(row?.created_at || '')))
      ))
    : null;
  return {
    payment_switch: paymentSwitch,
    activation_receipt: matchingReceipt
      ? {
          required: true,
          ready: true,
          activated_at: new Date(Date.parse(matchingReceipt.created_at)).toISOString(),
          actor_recorded: true,
          issue: null,
        }
      : {
          required: true,
          ready: false,
          activated_at: null,
          actor_recorded: false,
          issue: auditError
            ? 'The immutable payment activation ledger could not be loaded.'
            : 'Enabled payments do not have a matching immutable activation receipt.',
        },
  };
}

export async function loadPaymentActivationHealth(admin) {
  const settingsResult = await admin
    .from('admin_settings')
    .select('id,bookings_enabled,payments_enabled,updated_at')
    .limit(2);
  if (settingsResult.error || settingsResult.data?.[0]?.payments_enabled !== true) {
    return inspectPaymentActivationReceipt(settingsResult.data, settingsResult.error);
  }
  const auditResult = await admin
    .from('admin_content_changes')
    .select('resource_id,action,changed_by,previous_snapshot,new_snapshot,created_at')
    .eq('resource_type', 'launch_settings')
    .eq('resource_id', settingsResult.data[0].id)
    .order('created_at', { ascending: false })
    .limit(25);
  return inspectPaymentActivationReceipt(
    settingsResult.data,
    settingsResult.error,
    auditResult.data,
    auditResult.error,
  );
}

export function paymentActivationAllowsCheckout(activation) {
  return activation?.payment_switch?.ready === true
    && activation.payment_switch.state === 'enabled'
    && activation?.activation_receipt?.required === true
    && activation.activation_receipt.ready === true
    && activation.activation_receipt.actor_recorded === true;
}
