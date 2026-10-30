const appState = {
    session: null,
    activeSection: "dashboard",
    editingEntity: null,
    editingId: null,
    orderFilter: "all",
    search: "",
    data: {
        customers: [],
        orders: [],
        measurements: [],
        inventory: [],
        payments: [],
        measurementTemplates: [],
        measurementFields: []
    }
};

const entityMeta = {
    customer: { table: "tf_customers", plural: "customers", title: "Customer", section: "customers" },
    order: { table: "tf_orders", plural: "orders", title: "Order", section: "orders" },
    measurement: { table: "tf_measurements", plural: "measurements", title: "Measurements", section: "measurements" },
    inventory: { table: "tf_inventory", plural: "inventory", title: "Inventory item", section: "inventory" },
    payment: { table: "tf_payments", plural: "payments", title: "Payment", section: "payments" }
};

const fallbackMeasurementTemplates = [
    { id: "frock", name: "Frock", fields: ["Shoulder", "Bust", "Waist", "Hip", "Sleeve", "Armhole", "Full Length", "Frock Torso Height"] },
    { id: "blouse", name: "Blouse", fields: ["Shoulder", "Bust", "Waist", "Armhole", "Sleeve", "Sleeve Round", "Blouse Length", "Front Neck Depth", "Back Neck Depth"] },
    { id: "shirt", name: "Shirt", fields: ["Neck", "Shoulder", "Chest", "Waist", "Hip", "Sleeve", "Armhole", "Shirt Length"] },
    { id: "wedding-saree-jacket", name: "Wedding Saree Jacket", fields: ["Shoulder", "Bust", "Under Bust", "Waist", "Armhole", "Sleeve", "Jacket Length", "Front Neck Depth", "Back Neck Depth"] },
    { id: "wedding-frock", name: "Wedding frock", fields: ["Shoulder", "Bust", "Waist", "Hip", "Armhole", "Sleeve", "Torso Height", "Full Length"] },
    { id: "crop-top", name: "Crop top", fields: ["Shoulder", "Bust", "Waist", "Armhole", "Sleeve", "Top Length", "Front Neck Depth", "Back Neck Depth"] },
    { id: "lehenga", name: "Lehenga", fields: ["Waist", "Hip", "Waist to Hip", "Full Length", "Hem Round"] },
    { id: "shorts", name: "Shorts", fields: ["Waist", "Hip", "Rise", "Thigh", "Length", "Leg Opening"] },
    { id: "sarong", name: "Sarong", fields: ["Waist", "Hip", "Full Length"] },
    { id: "school-frock", name: "School Frock", fields: ["Shoulder", "Bust", "Waist", "Hip", "Sleeve", "Armhole", "Torso Height", "Full Length"] },
    { id: "trouser", name: "Trouser", fields: ["Waist", "Hip", "Rise", "Thigh", "Knee", "Inseam", "Outseam", "Bottom"] }
];

const currencyFormatter = new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric"
});

const appLayout = document.getElementById("appLayout");
const appLoading = document.getElementById("appLoading");
const appMessage = document.getElementById("appMessage");
const entityModalElement = document.getElementById("entityModal");
const entityModal = new bootstrap.Modal(entityModalElement);
const appToast = new bootstrap.Toast(document.getElementById("appToast"), { delay: 2400 });

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
    return currencyFormatter.format(Number(value || 0));
}

function formatDate(value) {
    if (!value) return "—";
    return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function dateInputValue(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function titleCase(value) {
    return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusBadge(status) {
    return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(titleCase(status))}</span>`;
}

function paymentTypeLabel(type) {
    return {
        advance: "Advance",
        full: "Full payment",
        balance: "Balance payment"
    }[type] || "Payment";
}

function paymentTypeBadge(type) {
    const safeType = ["advance", "full", "balance"].includes(type) ? type : "balance";
    return `<span class="payment-type-badge ${safeType}">${paymentTypeLabel(safeType)}</span>`;
}

function showToast(message) {
    document.getElementById("toastMessage").textContent = message;
    appToast.show();
}

function showError(message) {
    appMessage.textContent = message;
    appMessage.classList.remove("d-none");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showFormError(message) {
    const errorBox = document.getElementById("entityFormError");
    errorBox.textContent = message;
    errorBox.classList.remove("d-none");
}

function clearFormError() {
    const errorBox = document.getElementById("entityFormError");
    errorBox.textContent = "";
    errorBox.classList.add("d-none");
}

function clearError() {
    appMessage.classList.add("d-none");
    appMessage.textContent = "";
}

function withTimeout(request, timeoutMs = 10000) {
    return Promise.race([
        request,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("The request timed out.")), timeoutMs))
    ]);
}

function customerById(id) {
    return appState.data.customers.find((customer) => customer.id === id);
}

function orderById(id) {
    return appState.data.orders.find((order) => order.id === id);
}

function relatedName(record, relation, fallbackId) {
    if (record?.[relation]?.full_name) return record[relation].full_name;
    return customerById(record?.[fallbackId])?.full_name || "Unknown customer";
}

function matchesSearch(...values) {
    if (!appState.search) return true;
    const haystack = values.join(" ").toLowerCase();
    return haystack.includes(appState.search.toLowerCase());
}

function setCurrentDate() {
    const now = new Date();
    document.getElementById("todayDate").textContent = new Intl.DateTimeFormat("en-LK", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(now);

    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("welcomeTitle").textContent = `${greeting}, Thanu Fashion`;
}

async function fetchTable(table, select = "*") {
    const { data, error } = await withTimeout(
        supabaseClient.from(table).select(select).order("created_at", { ascending: false })
    );
    if (error) throw error;
    return data || [];
}

function useFallbackMeasurementConfiguration() {
    appState.data.measurementTemplates = fallbackMeasurementTemplates.map(({ id, name }) => ({ id, name }));
    appState.data.measurementFields = fallbackMeasurementTemplates.flatMap((template) => template.fields.map((name, index) => ({
        id: `${template.id}-${index + 1}`,
        template_id: template.id,
        name,
        unit: "inches",
        display_order: index + 1
    })));
}

async function loadMeasurementConfiguration() {
    const [templatesResult, fieldsResult] = await Promise.allSettled([
        withTimeout(supabaseClient.from("measurement_templates").select("id, name, description").order("id")),
        withTimeout(supabaseClient.from("measurement_fields").select("id, template_id, name, unit, display_order").order("display_order"))
    ]);

    const templates = templatesResult.status === "fulfilled" && !templatesResult.value.error
        ? templatesResult.value.data || []
        : [];
    const fields = fieldsResult.status === "fulfilled" && !fieldsResult.value.error
        ? fieldsResult.value.data || []
        : [];

    if (templates.length && fields.length) {
        appState.data.measurementTemplates = templates;
        appState.data.measurementFields = fields;
    } else {
        useFallbackMeasurementConfiguration();
        console.warn("Using built-in garment measurements because the existing template tables were unavailable.");
    }
}

async function loadAllData() {
    clearError();

    const queries = await Promise.allSettled([
        fetchTable("tf_customers"),
        fetchTable("tf_orders", "*, customers:tf_customers(full_name, phone)"),
        fetchTable("tf_measurements", "*, customers:tf_customers(full_name, phone)"),
        fetchTable("tf_inventory"),
        fetchTable("tf_payments", "*, customers:tf_customers(full_name), orders:tf_orders(order_number)")
    ]);

    const keys = ["customers", "orders", "measurements", "inventory", "payments"];
    const failures = [];

    queries.forEach((result, index) => {
        if (result.status === "fulfilled") {
            appState.data[keys[index]] = result.value;
        } else {
            appState.data[keys[index]] = [];
            failures.push(keys[index]);
            console.error(`Could not load ${keys[index]}:`, result.reason);
        }
    });

    if (failures.length) {
        showError(`Database setup is required for: ${failures.join(", ")}. Run supabase/schema.sql in the Supabase SQL Editor.`);
    }

    await loadMeasurementConfiguration();
    renderAll();
    return failures;
}

async function refreshData(button = null) {
    const originalLabel = button?.innerHTML;
    if (button) {
        button.classList.add("is-refreshing");
        button.innerHTML = "↻ <span class=\"d-none d-sm-inline\">Refreshing…</span>";
    }

    try {
        const failures = await loadAllData();
        if (failures.length) {
            showError("Some data could not be refreshed. Check your Supabase setup and try again.");
        } else {
            showToast("Data refreshed.");
        }
    } catch (error) {
        console.error("Refresh failed:", error);
        showError("Could not refresh your data. Please check your connection and try again.");
    } finally {
        if (button) {
            button.classList.remove("is-refreshing");
            button.innerHTML = originalLabel;
        }
    }
}

function renderAll() {
    renderDashboard();
    renderOrders();
    renderCustomers();
    renderMeasurements();
    renderInventory();
    renderPayments();
}

function renderDashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = appState.data.orders.filter((order) => dateInputValue(order.created_at) === today);
    const pending = appState.data.orders.filter((order) => ["pending", "in_progress"].includes(order.status));
    const received = appState.data.payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);

    document.getElementById("todayOrders").textContent = todayOrders.length;
    document.getElementById("pendingOrders").textContent = pending.length;
    document.getElementById("customerCount").textContent = appState.data.customers.length;
    document.getElementById("paymentsReceived").textContent = formatCurrency(received);

    const recentOrders = appState.data.orders.slice(0, 6);
    const recentBody = document.getElementById("recentOrdersBody");
    recentBody.innerHTML = recentOrders.map((order) => `
        <tr>
            <td><strong>${escapeHtml(relatedName(order, "customers", "customer_id"))}</strong></td>
            <td>${escapeHtml(order.garment_type)}</td>
            <td>${formatDate(order.due_date)}</td>
            <td>${statusBadge(order.status)}</td>
            <td>${formatCurrency(order.total_amount)}</td>
        </tr>
    `).join("");
    document.getElementById("recentOrdersEmpty").classList.toggle("d-none", recentOrders.length > 0);

    const alerts = [];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    appState.data.orders.forEach((order) => {
        if (!order.due_date || ["completed", "cancelled"].includes(order.status)) return;
        const dueDate = new Date(`${order.due_date}T23:59:59`);
        if (dueDate < new Date()) {
            alerts.push({ tone: "danger", title: `${order.order_number} is overdue`, detail: relatedName(order, "customers", "customer_id") });
        } else if (dueDate <= nextWeek) {
            alerts.push({ tone: "warning", title: `${order.order_number} due ${formatDate(order.due_date)}`, detail: order.garment_type });
        }
    });

    appState.data.inventory.forEach((item) => {
        if (Number(item.quantity) <= Number(item.reorder_level || 0)) {
            alerts.push({ tone: "danger", title: `${item.item_name} is low`, detail: `${item.quantity} ${item.unit} remaining` });
        }
    });

    const alertList = document.getElementById("shopAlerts");
    alertList.innerHTML = alerts.length
        ? alerts.slice(0, 6).map((alert) => `<div class="shop-alert ${alert.tone}"><span></span><div><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(alert.detail)}</small></div></div>`).join("")
        : `<div class="empty-mini"><span>✓</span><strong>Everything looks good</strong><small>No urgent orders or stock alerts.</small></div>`;
}

function orderPayments(orderId) {
    return appState.data.payments
        .filter((payment) => payment.order_id === orderId)
        .reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function legacyAdvanceForOrder(order) {
    const hasRecordedAdvance = appState.data.payments.some((payment) => {
        return payment.order_id === order.id && payment.payment_type === "advance";
    });
    return hasRecordedAdvance ? 0 : Number(order.advance_amount || 0);
}

function orderPaidAmount(order) {
    return legacyAdvanceForOrder(order) + orderPayments(order.id);
}

function orderBalance(order) {
    return Math.max(0, Number(order.total_amount || 0) - orderPaidAmount(order));
}

function renderOrders() {
    const orders = appState.data.orders.filter((order) => {
        const customerName = relatedName(order, "customers", "customer_id");
        const matchesFilter = appState.orderFilter === "all" || order.status === appState.orderFilter;
        return matchesFilter && matchesSearch(order.order_number, customerName, order.garment_type, order.status);
    });

    document.getElementById("ordersBody").innerHTML = orders.map((order) => {
        const balance = orderBalance(order);
        return `
            <tr>
                <td><strong>${escapeHtml(order.order_number)}</strong><small>${formatDate(order.order_date)}</small></td>
                <td>${escapeHtml(relatedName(order, "customers", "customer_id"))}</td>
                <td>${escapeHtml(order.garment_type)}</td>
                <td>${formatDate(order.due_date)}</td>
                <td>${statusBadge(order.status)}</td>
                <td><strong>${formatCurrency(balance)}</strong></td>
                <td>${orderActions(order, balance)}</td>
            </tr>`;
    }).join("");
    document.getElementById("ordersEmpty").classList.toggle("d-none", orders.length > 0);
}

function orderActions(order, balance) {
    const confirmButton = balance > 0 && order.status !== "cancelled"
        ? `<button type="button" class="confirm" data-action="confirm-payment" data-id="${order.id}">Confirm payment</button>`
        : `<span class="paid-label">Paid</span>`;

    return `<div class="row-actions">${confirmButton}
        <button type="button" data-action="edit" data-entity="order" data-id="${order.id}" aria-label="Edit order">Edit</button>
        <button type="button" class="danger" data-action="delete" data-entity="order" data-id="${order.id}" aria-label="Delete order">Delete</button>
    </div>`;
}

function renderCustomers() {
    const customers = appState.data.customers.filter((customer) => matchesSearch(customer.full_name, customer.phone, customer.email, customer.address));
    document.getElementById("customersGrid").innerHTML = customers.map((customer) => {
        const orderCount = appState.data.orders.filter((order) => order.customer_id === customer.id).length;
        const initials = customer.full_name.split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase();
        return `
            <article class="customer-card">
                <div class="customer-card-head">
                    <span class="customer-avatar">${escapeHtml(initials)}</span>
                    <div><h2>${escapeHtml(customer.full_name)}</h2><p>${escapeHtml(customer.phone)}</p></div>
                    ${rowActions("customer", customer.id)}
                </div>
                <dl class="customer-details">
                    <div><dt>Orders</dt><dd>${orderCount}</dd></div>
                    <div><dt>Email</dt><dd>${escapeHtml(customer.email || "—")}</dd></div>
                    <div class="full"><dt>Address</dt><dd>${escapeHtml(customer.address || "—")}</dd></div>
                </dl>
            </article>`;
    }).join("");
    document.getElementById("customersEmpty").classList.toggle("d-none", customers.length > 0);
}

function renderMeasurements() {
    const measurements = appState.data.measurements.filter((item) => matchesSearch(
        relatedName(item, "customers", "customer_id"), item.profile_name, item.notes
    ));

    document.getElementById("measurementsGrid").innerHTML = measurements.map((item) => {
        const dynamicValues = Object.entries(item.extra_values || {}).map(([label, stored]) => {
            const isObjectValue = stored && typeof stored === "object";
            return [label, isObjectValue ? stored.value : stored, isObjectValue ? stored.unit : "inches"];
        });
        const legacyValues = [
            ["Chest", item.chest, "inches"], ["Waist", item.waist, "inches"], ["Hips", item.hips, "inches"], ["Shoulder", item.shoulder, "inches"],
            ["Sleeve", item.sleeve_length, "inches"], ["Length", item.garment_length, "inches"], ["Neck", item.neck, "inches"], ["Inseam", item.inseam, "inches"]
        ];
        const values = (dynamicValues.length ? dynamicValues : legacyValues)
            .filter(([, value]) => value !== null && value !== "" && value !== undefined);

        return `
            <article class="measurement-card">
                <div class="card-heading">
                    <div><p class="eyebrow">${escapeHtml(item.profile_name)}</p><h2>${escapeHtml(relatedName(item, "customers", "customer_id"))}</h2></div>
                    ${rowActions("measurement", item.id)}
                </div>
                <div class="measurement-values">
                    ${values.map(([label, value, unit]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)} ${escapeHtml(unit === "inches" ? "in" : unit)}</strong></div>`).join("")}
                </div>
                ${item.notes ? `<p class="measurement-note">${escapeHtml(item.notes)}</p>` : ""}
            </article>`;
    }).join("");
    document.getElementById("measurementsEmpty").classList.toggle("d-none", measurements.length > 0);
}

function renderInventory() {
    const inventory = appState.data.inventory.filter((item) => matchesSearch(item.item_name, item.category, item.unit));
    document.getElementById("inventoryBody").innerHTML = inventory.map((item) => {
        const isLow = Number(item.quantity) <= Number(item.reorder_level || 0);
        return `
            <tr>
                <td><strong>${escapeHtml(item.item_name)}</strong></td>
                <td>${escapeHtml(item.category || "—")}</td>
                <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
                <td>${formatCurrency(item.unit_cost)}</td>
                <td><span class="stock-badge ${isLow ? "low" : "good"}">${isLow ? "Low stock" : "In stock"}</span></td>
                <td>${rowActions("inventory", item.id)}</td>
            </tr>`;
    }).join("");
    document.getElementById("inventoryEmpty").classList.toggle("d-none", inventory.length > 0);
}

function renderPayments() {
    const recordedPayments = appState.data.payments.map((payment) => ({
        ...payment,
        payment_type: payment.payment_type || "full",
        isLegacyAdvance: false
    }));

    const orderAdvances = appState.data.orders
        .filter((order) => legacyAdvanceForOrder(order) > 0)
        .map((order) => ({
            id: `order-advance-${order.id}`,
            customer_id: order.customer_id,
            customers: order.customers,
            order_id: order.id,
            orders: { order_number: order.order_number },
            amount: legacyAdvanceForOrder(order),
            paid_at: order.order_date,
            method: "order advance",
            payment_type: "advance",
            isLegacyAdvance: true
        }));

    const activities = [...recordedPayments, ...orderAdvances]
        .sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0));
    const payments = activities.filter((payment) => matchesSearch(
        relatedName(payment, "customers", "customer_id"), payment.orders?.order_number, payment.method, payment.payment_type, payment.amount
    ));

    document.getElementById("paymentsBody").innerHTML = payments.map((payment) => `
        <tr>
            <td>${formatDate(payment.paid_at)}</td>
            <td><strong>${escapeHtml(relatedName(payment, "customers", "customer_id"))}</strong></td>
            <td>${escapeHtml(payment.orders?.order_number || orderById(payment.order_id)?.order_number || "—")}</td>
            <td>${paymentTypeBadge(payment.payment_type)}</td>
            <td>${escapeHtml(payment.isLegacyAdvance ? "Order advance" : titleCase(payment.method))}</td>
            <td><strong>${formatCurrency(payment.amount)}</strong></td>
            <td>${payment.isLegacyAdvance ? `<small class="text-muted">Edit order</small>` : rowActions("payment", payment.id)}</td>
        </tr>
    `).join("");

    const total = activities.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const advancePayments = activities.filter((payment) => payment.payment_type === "advance");
    const fullPayments = activities.filter((payment) => payment.payment_type === "full");
    const balancePayments = activities.filter((payment) => payment.payment_type === "balance");
    document.getElementById("paymentTotal").textContent = formatCurrency(total);
    document.getElementById("paymentAdvance").textContent = formatCurrency(advancePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    document.getElementById("paymentFull").textContent = formatCurrency(fullPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    document.getElementById("paymentBalance").textContent = formatCurrency(balancePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    document.getElementById("paymentAdvanceCount").textContent = `${advancePayments.length} advance ${advancePayments.length === 1 ? "payment" : "payments"}`;
    document.getElementById("paymentFullCount").textContent = `${fullPayments.length} full ${fullPayments.length === 1 ? "payment" : "payments"}`;
    document.getElementById("paymentBalanceCount").textContent = `${balancePayments.length} balance ${balancePayments.length === 1 ? "payment" : "payments"}`;
    document.getElementById("paymentsEmpty").classList.toggle("d-none", payments.length > 0);
}

function rowActions(entity, id) {
    return `
        <div class="row-actions">
            <button type="button" data-action="edit" data-entity="${entity}" data-id="${id}" aria-label="Edit ${entity}">Edit</button>
            <button type="button" class="danger" data-action="delete" data-entity="${entity}" data-id="${id}" aria-label="Delete ${entity}">Delete</button>
        </div>`;
}

function selectOptions(items, valueKey, labelBuilder, selectedValue) {
    return items.map((item) => {
        const value = item[valueKey];
        const selected = value === selectedValue ? " selected" : "";
        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(labelBuilder(item))}</option>`;
    }).join("");
}

function fieldInput({ name, label, type = "text", value = "", required = false, min, step, placeholder = "", options, col = "col-12", rows = 3 }) {
    const requiredMark = required ? " required" : "";
    const attributes = `${min !== undefined ? ` min="${min}"` : ""}${step !== undefined ? ` step="${step}"` : ""}`;
    let control;

    if (type === "select") {
        control = `<select class="form-select" id="field-${name}" name="${name}"${requiredMark}>${options}</select>`;
    } else if (type === "textarea") {
        control = `<textarea class="form-control" id="field-${name}" name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}"${requiredMark}>${escapeHtml(value)}</textarea>`;
    } else {
        control = `<input class="form-control" id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${attributes}${requiredMark}>`;
    }

    return `<div class="${col}"><label class="form-label" for="field-${name}">${escapeHtml(label)}</label>${control}</div>`;
}

function measurementFieldsForProfile(profileName) {
    if (!profileName) return [];
    const template = appState.data.measurementTemplates.find((item) => item.name === profileName)
        || appState.data.measurementTemplates[0];
    if (!template) return [];

    return appState.data.measurementFields
        .filter((field) => String(field.template_id) === String(template.id))
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
}

function measurementInputName(field) {
    return `measurement__${String(field.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderDynamicMeasurementInputs(profileName, savedValues = {}) {
    const fields = measurementFieldsForProfile(profileName);

    if (!fields.length) {
        return `<div class="col-12"><div class="measurement-form-empty">No measurement fields are configured for this garment.</div></div>`;
    }

    return fields.map((field) => {
        const stored = savedValues?.[field.name];
        const value = stored && typeof stored === "object" ? stored.value : stored ?? "";
        const unit = field.unit || "inches";
        const name = measurementInputName(field);
        return `
            <div class="col-6">
                <label class="form-label" for="field-${name}">${escapeHtml(field.name)} <span class="field-unit">(${escapeHtml(unit)})</span></label>
                <input
                    class="form-control dynamic-measurement-input"
                    id="field-${name}"
                    name="${name}"
                    type="number"
                    min="0"
                    step="0.01"
                    value="${escapeHtml(value)}"
                    data-measurement-label="${escapeHtml(field.name)}"
                    data-measurement-unit="${escapeHtml(unit)}"
                    inputmode="decimal"
                >
            </div>`;
    }).join("");
}

function measurementForm(customerOptions, record) {
    const selectedProfile = record.profile_name || appState.data.measurementTemplates[0]?.name || "";
    const garmentOptions = `<option value="">Select garment</option>${appState.data.measurementTemplates.map((template) => `
        <option value="${escapeHtml(template.name)}"${template.name === selectedProfile ? " selected" : ""}>${escapeHtml(template.name)}</option>
    `).join("")}`;

    return `
        <div class="row g-3">
            ${fieldInput({ name: "customer_id", label: "Customer", type: "select", options: customerOptions, required: true })}
            ${fieldInput({ name: "profile_name", label: "Garment", type: "select", options: garmentOptions, required: true })}
            <div class="col-12"><div class="measurement-divider"><span>Required measurements</span></div></div>
            <div class="col-12"><div class="row g-3" id="dynamicMeasurementFields">${renderDynamicMeasurementInputs(selectedProfile, record.extra_values || {})}</div></div>
            ${fieldInput({ name: "notes", label: "Additional notes", type: "textarea", value: record.notes })}
        </div>`;
}

function orderForm(record, today) {
    const customerOptions = `<option value="">Select customer</option><option value="__new__">＋ Add a new customer</option>${selectOptions(appState.data.customers, "id", (item) => `${item.full_name} · ${item.phone}`, record.customer_id)}`;
    const statusOptions = ["pending", "in_progress", "ready", "completed", "cancelled"]
        .map((status) => `<option value="${status}"${(record.status || "pending") === status ? " selected" : ""}>${titleCase(status)}</option>`).join("");
    const methodOptions = ["cash", "card", "bank_transfer", "online", "other"]
        .map((method) => `<option value="${method}"${(record.advance_method || "cash") === method ? " selected" : ""}>${titleCase(method)}</option>`).join("");

    return `
        <div class="row g-3">
            ${fieldInput({ name: "customer_id", label: "Customer", type: "select", options: customerOptions, required: true })}
            <div class="col-12 d-none" id="newCustomerFields">
                <div class="new-customer-panel">
                    <div class="d-flex justify-content-between align-items-center gap-2 mb-2"><strong>New customer details</strong><small>Saved automatically with this order</small></div>
                    <div class="row g-3">
                        <div class="col-md-6"><label class="form-label" for="field-new_customer_full_name">Customer name</label><input class="form-control" id="field-new_customer_full_name" name="new_customer_full_name" type="text" placeholder="Full name"></div>
                        <div class="col-md-6"><label class="form-label" for="field-new_customer_phone">Phone number</label><input class="form-control" id="field-new_customer_phone" name="new_customer_phone" type="tel" placeholder="077 123 4567"></div>
                        <div class="col-md-6"><label class="form-label" for="field-new_customer_whatsapp">WhatsApp number</label><input class="form-control" id="field-new_customer_whatsapp" name="new_customer_whatsapp" type="tel" placeholder="Optional"></div>
                        <div class="col-md-6"><label class="form-label" for="field-new_customer_email">Email</label><input class="form-control" id="field-new_customer_email" name="new_customer_email" type="email" placeholder="Optional"></div>
                    </div>
                </div>
            </div>
            ${fieldInput({ name: "garment_type", label: "Garment / service", value: record.garment_type, placeholder: "e.g. Saree jacket", required: true, col: "col-md-6" })}
            ${fieldInput({ name: "status", label: "Status", type: "select", options: statusOptions, col: "col-md-6" })}
            ${fieldInput({ name: "order_date", label: "Order date", type: "date", value: dateInputValue(record.order_date) || today, required: true, col: "col-md-6" })}
            ${fieldInput({ name: "due_date", label: "Due date", type: "date", value: dateInputValue(record.due_date), required: true, col: "col-md-6" })}
            ${fieldInput({ name: "total_amount", label: "Total amount (LKR)", type: "number", value: record.total_amount ?? "", min: 0, step: 0.01, required: true, col: "col-md-6" })}
            ${fieldInput({ name: "advance_amount", label: "Advance received (LKR)", type: "number", value: record.advance_amount ?? 0, min: 0, step: 0.01, col: "col-md-6" })}
            ${fieldInput({ name: "advance_method", label: "Advance payment method", type: "select", options: methodOptions, col: "col-md-6" })}
            ${fieldInput({ name: "notes", label: "Order notes", type: "textarea", value: record.notes, placeholder: "Design details, fabric, colour and special requests" })}
        </div>`;
}

function paymentConfirmationForm(order) {
    const balance = orderBalance(order);
    const type = orderPaidAmount(order) > 0 ? "balance" : "full";
    const methodOptions = ["cash", "card", "bank_transfer", "online", "other"]
        .map((method) => `<option value="${method}">${titleCase(method)}</option>`).join("");
    const today = new Date().toISOString().slice(0, 10);

    return `
        <input type="hidden" name="customer_id" value="${escapeHtml(order.customer_id)}">
        <input type="hidden" name="order_id" value="${escapeHtml(order.id)}">
        <input type="hidden" name="payment_type" value="${type}">
        <input type="hidden" name="amount" value="${balance}">
        <div class="payment-confirmation">
            <p class="eyebrow">Confirm customer payment</p>
            <h3>${escapeHtml(relatedName(order, "customers", "customer_id"))}</h3>
            <p>Order <strong>${escapeHtml(order.order_number)}</strong> · ${escapeHtml(order.garment_type)}</p>
            <div class="payment-confirmation-total"><span>${paymentTypeLabel(type)}</span><strong>${formatCurrency(balance)}</strong></div>
        </div>
        <div class="row g-3 mt-1">
            ${fieldInput({ name: "paid_at", label: "Payment date", type: "date", value: today, required: true, col: "col-md-6" })}
            ${fieldInput({ name: "method", label: "Payment method", type: "select", options: methodOptions, required: true, col: "col-md-6" })}
            ${fieldInput({ name: "notes", label: "Notes", type: "textarea", value: "Balance confirmed from Orders", rows: 2 })}
        </div>`;
}

function getFormFields(entity, record = {}) {
    const customerOptions = `<option value="">Select customer</option>${selectOptions(appState.data.customers, "id", (item) => `${item.full_name} · ${item.phone}`, record.customer_id)}`;
    const orderOptions = `<option value="">No linked order</option>${selectOptions(appState.data.orders, "id", (item) => `${item.order_number} · ${relatedName(item, "customers", "customer_id")}`, record.order_id)}`;
    const today = new Date().toISOString().slice(0, 10);
    let fields = [];

    if (entity === "customer") {
        fields = [
            { name: "full_name", label: "Full name", value: record.full_name, required: true },
            { name: "phone", label: "Phone number", type: "tel", value: record.phone, required: true, col: "col-md-6" },
            { name: "whatsapp", label: "WhatsApp number", type: "tel", value: record.whatsapp, col: "col-md-6" },
            { name: "email", label: "Email", type: "email", value: record.email, col: "col-md-6" },
            { name: "address", label: "Address", value: record.address, col: "col-md-6" },
            { name: "notes", label: "Notes", type: "textarea", value: record.notes, placeholder: "Preferences, fitting notes or reminders" }
        ];
    }

    if (entity === "order") return orderForm(record, today);

    if (entity === "measurement") return measurementForm(customerOptions, record);

    if (entity === "inventory") {
        fields = [
            { name: "item_name", label: "Item name", value: record.item_name, placeholder: "e.g. Maroon satin", required: true },
            { name: "category", label: "Category", type: "select", options: ["Fabric", "Thread", "Buttons", "Zips", "Lining", "Embellishment", "Other"].map((category) => `<option value="${category}"${record.category === category ? " selected" : ""}>${category}</option>`).join(""), col: "col-md-6" },
            { name: "unit", label: "Unit", type: "select", options: ["metres", "yards", "pieces", "rolls", "packs"].map((unit) => `<option value="${unit}"${record.unit === unit ? " selected" : ""}>${titleCase(unit)}</option>`).join(""), col: "col-md-6" },
            { name: "quantity", label: "Quantity", type: "number", value: record.quantity ?? 0, min: 0, step: 0.01, required: true, col: "col-md-4" },
            { name: "reorder_level", label: "Low-stock level", type: "number", value: record.reorder_level ?? 0, min: 0, step: 0.01, col: "col-md-4" },
            { name: "unit_cost", label: "Unit cost (LKR)", type: "number", value: record.unit_cost ?? 0, min: 0, step: 0.01, col: "col-md-4" },
            { name: "notes", label: "Notes", type: "textarea", value: record.notes }
        ];
    }

    if (entity === "payment") {
        fields = [
            { name: "customer_id", label: "Customer", type: "select", options: customerOptions, required: true },
            { name: "order_id", label: "Linked order", type: "select", options: orderOptions },
            { name: "payment_type", label: "Payment type", type: "select", options: ["advance", "full", "balance"].map((type) => `<option value="${type}"${(record.payment_type || "balance") === type ? " selected" : ""}>${paymentTypeLabel(type)}</option>`).join(""), required: true },
            { name: "amount", label: "Amount (LKR)", type: "number", value: record.amount ?? "", min: 0.01, step: 0.01, required: true, col: "col-md-6" },
            { name: "paid_at", label: "Payment date", type: "date", value: dateInputValue(record.paid_at) || today, required: true, col: "col-md-6" },
            { name: "method", label: "Payment method", type: "select", options: ["cash", "card", "bank_transfer", "online", "other"].map((method) => `<option value="${method}"${record.method === method ? " selected" : ""}>${titleCase(method)}</option>`).join(""), required: true },
            { name: "notes", label: "Notes", type: "textarea", value: record.notes }
        ];
    }

    return `<div class="row g-3">${fields.map(fieldInput).join("")}</div>`;
}

function openEntityModal(entity, id = null) {
    const meta = entityMeta[entity];
    if (!meta) return;

    if (["order", "measurement", "payment"].includes(entity) && appState.data.customers.length === 0) {
        showToast("Add a customer first.");
        navigateTo("customers");
        return;
    }

    const record = id ? appState.data[meta.plural].find((item) => item.id === id) : {};
    appState.editingEntity = entity;
    appState.editingId = id;
    clearFormError();
    document.getElementById("entityModalEyebrow").textContent = "Thanu Fashion";
    document.getElementById("entityModalTitle").textContent = `${id ? "Edit" : "Add"} ${meta.title.toLowerCase()}`;
    document.getElementById("entityFormFields").innerHTML = getFormFields(entity, record || {});
    document.getElementById("saveEntityButton").textContent = id ? "Save changes" : `Add ${meta.title.toLowerCase()}`;
    entityModal.show();
    if (entity === "order") toggleNewCustomerFields();

    window.setTimeout(() => {
        document.querySelector("#entityFormFields input, #entityFormFields select, #entityFormFields textarea")?.focus();
    }, 180);
}

function openPaymentConfirmation(orderId) {
    const order = orderById(orderId);
    if (!order) return;

    const balance = orderBalance(order);
    if (balance <= 0) {
        showToast("This order is already fully paid.");
        return;
    }

    appState.editingEntity = "payment";
    appState.editingId = null;
    clearFormError();
    document.getElementById("entityModalEyebrow").textContent = "Payments update automatically";
    document.getElementById("entityModalTitle").textContent = "Confirm payment received";
    document.getElementById("entityFormFields").innerHTML = paymentConfirmationForm(order);
    document.getElementById("saveEntityButton").textContent = `Confirm ${formatCurrency(balance)} received`;
    entityModal.show();
}

function toggleNewCustomerFields() {
    const select = document.getElementById("field-customer_id");
    const container = document.getElementById("newCustomerFields");
    if (!select || !container) return;

    const isNewCustomer = select.value === "__new__";
    container.classList.toggle("d-none", !isNewCustomer);
    ["new_customer_full_name", "new_customer_phone"].forEach((name) => {
        const input = document.querySelector(`[name="${name}"]`);
        if (input) input.required = isNewCustomer;
    });
}

function formPayload(form, entity) {
    const payload = Object.fromEntries(new FormData(form).entries());
    const numericFields = {
        order: ["total_amount", "advance_amount"],
        measurement: [],
        inventory: ["quantity", "reorder_level", "unit_cost"],
        payment: ["amount"]
    }[entity] || [];

    if (entity === "measurement") {
        const extraValues = {};
        form.querySelectorAll(".dynamic-measurement-input").forEach((input) => {
            delete payload[input.name];
            if (input.value === "") return;
            extraValues[input.dataset.measurementLabel] = {
                value: Number(input.value),
                unit: input.dataset.measurementUnit || "inches"
            };
        });
        payload.extra_values = extraValues;
    }

    if (entity === "order") {
        const isNewCustomer = payload.customer_id === "__new__";
        const advanceMethod = payload.advance_method || "cash";
        delete payload.advance_method;

        if (isNewCustomer) {
            payload._newCustomer = {
                full_name: payload.new_customer_full_name,
                phone: payload.new_customer_phone,
                whatsapp: payload.new_customer_whatsapp || null,
                email: payload.new_customer_email || null
            };
            payload.customer_id = null;
        }

        delete payload.new_customer_full_name;
        delete payload.new_customer_phone;
        delete payload.new_customer_whatsapp;
        delete payload.new_customer_email;
        payload._advanceMethod = advanceMethod;
    }

    numericFields.forEach((field) => {
        payload[field] = payload[field] === "" ? null : Number(payload[field]);
    });

    ["order_id", "customer_id"].forEach((field) => {
        if (field in payload && payload[field] === "") payload[field] = null;
    });

    Object.keys(payload).forEach((key) => {
        if (payload[key] === "" && !numericFields.includes(key)) payload[key] = null;
    });

    payload.user_id = appState.session.user.id;
    if (entity === "order" && !appState.editingId) {
        const stamp = new Date().toISOString().slice(2, 10).replaceAll("-", "");
        payload.order_number = `TF-${stamp}-${Math.floor(100 + Math.random() * 900)}`;
    }

    return payload;
}

async function saveEntity(event) {
    event.preventDefault();
    clearError();
    clearFormError();
    const entity = appState.editingEntity;
    const meta = entityMeta[entity];
    const button = document.getElementById("saveEntityButton");
    const originalLabel = button.textContent;
    const payload = formPayload(event.currentTarget, entity);

    button.disabled = true;
    button.textContent = "Saving…";

    try {
        let initialAdvance = 0;
        let advanceMethod = "cash";

        if (entity === "order") {
            const newCustomer = payload._newCustomer;
            delete payload._newCustomer;
            advanceMethod = payload._advanceMethod || "cash";
            delete payload._advanceMethod;
            initialAdvance = appState.editingId ? 0 : Number(payload.advance_amount || 0);

            if (newCustomer) {
                const { data: customer, error: customerError } = await withTimeout(
                    supabaseClient.from("tf_customers").insert({ ...newCustomer, user_id: appState.session.user.id }).select().single()
                );
                if (customerError) throw customerError;
                payload.customer_id = customer.id;
            }
        }

        let request = supabaseClient.from(meta.table);
        request = appState.editingId
            ? request.update(payload).eq("id", appState.editingId)
            : entity === "order"
                ? request.insert(payload).select().single()
                : request.insert(payload);

        const { data: savedRecord, error } = await withTimeout(request);
        if (error) throw error;

        if (entity === "order" && initialAdvance > 0) {
            const { error: advanceError } = await withTimeout(supabaseClient.from("tf_payments").insert({
                user_id: appState.session.user.id,
                customer_id: savedRecord.customer_id,
                order_id: savedRecord.id,
                amount: initialAdvance,
                payment_type: "advance",
                method: advanceMethod,
                paid_at: savedRecord.order_date,
                notes: "Initial advance recorded with order."
            }));
            if (advanceError) throw new Error(`Order saved, but the advance could not be recorded: ${advanceError.message}`);
        }

        const failures = await loadAllData();
        entityModal.hide();
        showToast(`${meta.title} ${appState.editingId ? "updated" : "added"} successfully.`);
        navigateTo(meta.section);

        if (failures.length) {
            showError("Your record was saved, but the latest data could not be reloaded. Tap Refresh to try again.");
        }
    } catch (error) {
        console.error(`Could not save ${entity}:`, error);
        const message = error?.message || "Could not save this record. Please try again.";
        showFormError(message.includes("extra_values")
            ? "Database update needed: run supabase/add-dynamic-measurements.sql once, then try again."
            : message);
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
    }
}

async function deleteEntity(entity, id) {
    const meta = entityMeta[entity];
    if (!meta || !window.confirm(`Delete this ${meta.title.toLowerCase()}? This cannot be undone.`)) return;

    try {
        const { error } = await withTimeout(supabaseClient.from(meta.table).delete().eq("id", id));
        if (error) throw error;

        const failures = await loadAllData();
        showToast(`${meta.title} deleted.`);
        if (failures.length) showError("The record was deleted, but the latest data could not be reloaded. Tap Refresh to try again.");
    } catch (error) {
        console.error(`Could not delete ${entity}:`, error);
        showError(error?.message || `Could not delete this ${meta.title.toLowerCase()}.`);
    }
}

function navigateTo(section) {
    const target = document.getElementById(`section-${section}`);
    if (!target) return;

    appState.activeSection = section;
    document.querySelectorAll(".app-section").forEach((item) => item.classList.toggle("active", item === target));
    document.querySelectorAll("[data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
    document.getElementById("pageTitle").textContent = target.dataset.title;
    document.getElementById("pageEyebrow").textContent = target.dataset.eyebrow;

    const actionMap = {
        dashboard: ["+ New order", "order"], orders: ["+ New order", "order"], customers: ["+ Add customer", "customer"],
        measurements: ["+ Add measurements", "measurement"], inventory: ["+ Add item", "inventory"], payments: ["+ Record payment", "payment"]
    };
    const [label, entity] = actionMap[section];
    const primaryAction = document.getElementById("primaryAction");
    primaryAction.textContent = label;
    primaryAction.dataset.openEntity = entity;
    closeSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeSidebar() {
    document.getElementById("appSidebar").classList.remove("open");
    document.getElementById("sidebarScrim").classList.remove("show");
    document.getElementById("menuButton").setAttribute("aria-expanded", "false");
}

function bindEvents() {
    document.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;

        if (button.dataset.section) {
            navigateTo(button.dataset.section);
            return;
        }

        if (button.dataset.goSection) {
            navigateTo(button.dataset.goSection);
            return;
        }

        if (button.dataset.openEntity) {
            openEntityModal(button.dataset.openEntity);
            return;
        }

        if (button.dataset.action === "edit") {
            openEntityModal(button.dataset.entity, button.dataset.id);
            return;
        }

        if (button.dataset.action === "delete") {
            deleteEntity(button.dataset.entity, button.dataset.id);
            return;
        }

        if (button.dataset.systemAction === "refresh") {
            refreshData(button);
        }
    });

    document.addEventListener("change", (event) => {
        if (event.target.id !== "field-profile_name" || appState.editingEntity !== "measurement") return;
        const container = document.getElementById("dynamicMeasurementFields");
        if (container) container.innerHTML = renderDynamicMeasurementInputs(event.target.value);
    });

    document.getElementById("entityForm").addEventListener("submit", saveEntity);
    document.getElementById("globalSearch").addEventListener("input", (event) => {
        appState.search = event.target.value.trim();
        renderAll();
    });

    document.querySelectorAll("[data-order-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            appState.orderFilter = button.dataset.orderFilter;
            document.querySelectorAll("[data-order-filter]").forEach((item) => item.classList.toggle("active", item === button));
            renderOrders();
        });
    });

    document.getElementById("menuButton").addEventListener("click", () => {
        const sidebar = document.getElementById("appSidebar");
        const isOpen = sidebar.classList.toggle("open");
        document.getElementById("sidebarScrim").classList.toggle("show", isOpen);
        document.getElementById("menuButton").setAttribute("aria-expanded", String(isOpen));
    });
    document.getElementById("sidebarScrim").addEventListener("click", closeSidebar);

    document.getElementById("logoutButton").addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        window.location.replace("login.html");
    });
}

async function initializeApp() {
    setCurrentDate();
    bindEvents();

    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        window.location.replace("login.html");
        return;
    }

    appState.session = session;
    document.getElementById("signedInEmail").textContent = session.user.email;
    await loadAllData();
    appLoading.classList.add("d-none");
    appLayout.classList.remove("d-none");
}

supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") window.location.replace("login.html");
});

initializeApp().catch((error) => {
    console.error("Application failed to start:", error);
    appLoading.innerHTML = `<strong>Thanu Fashion could not start.</strong><span>${escapeHtml(error.message)}</span>`;
});
