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
        payments: []
    }
};

const entityMeta = {
    customer: { table: "tf_customers", plural: "customers", title: "Customer", section: "customers" },
    order: { table: "tf_orders", plural: "orders", title: "Order", section: "orders" },
    measurement: { table: "tf_measurements", plural: "measurements", title: "Measurements", section: "measurements" },
    inventory: { table: "tf_inventory", plural: "inventory", title: "Inventory item", section: "inventory" },
    payment: { table: "tf_payments", plural: "payments", title: "Payment", section: "payments" }
};

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

function showToast(message) {
    document.getElementById("toastMessage").textContent = message;
    appToast.show();
}

function showError(message) {
    appMessage.textContent = message;
    appMessage.classList.remove("d-none");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    renderAll();
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

function renderOrders() {
    const orders = appState.data.orders.filter((order) => {
        const customerName = relatedName(order, "customers", "customer_id");
        const matchesFilter = appState.orderFilter === "all" || order.status === appState.orderFilter;
        return matchesFilter && matchesSearch(order.order_number, customerName, order.garment_type, order.status);
    });

    document.getElementById("ordersBody").innerHTML = orders.map((order) => {
        const paid = Number(order.advance_amount || 0) + orderPayments(order.id);
        const balance = Math.max(0, Number(order.total_amount || 0) - paid);
        return `
            <tr>
                <td><strong>${escapeHtml(order.order_number)}</strong><small>${formatDate(order.order_date)}</small></td>
                <td>${escapeHtml(relatedName(order, "customers", "customer_id"))}</td>
                <td>${escapeHtml(order.garment_type)}</td>
                <td>${formatDate(order.due_date)}</td>
                <td>${statusBadge(order.status)}</td>
                <td><strong>${formatCurrency(balance)}</strong></td>
                <td>${rowActions("order", order.id)}</td>
            </tr>`;
    }).join("");
    document.getElementById("ordersEmpty").classList.toggle("d-none", orders.length > 0);
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
        const values = [
            ["Chest", item.chest], ["Waist", item.waist], ["Hips", item.hips], ["Shoulder", item.shoulder],
            ["Sleeve", item.sleeve_length], ["Length", item.garment_length], ["Neck", item.neck], ["Inseam", item.inseam]
        ].filter(([, value]) => value !== null && value !== "" && value !== undefined);

        return `
            <article class="measurement-card">
                <div class="card-heading">
                    <div><p class="eyebrow">${escapeHtml(item.profile_name)}</p><h2>${escapeHtml(relatedName(item, "customers", "customer_id"))}</h2></div>
                    ${rowActions("measurement", item.id)}
                </div>
                <div class="measurement-values">
                    ${values.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)} in</strong></div>`).join("")}
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
    const payments = appState.data.payments.filter((payment) => matchesSearch(
        relatedName(payment, "customers", "customer_id"), payment.orders?.order_number, payment.method, payment.amount
    ));

    document.getElementById("paymentsBody").innerHTML = payments.map((payment) => `
        <tr>
            <td>${formatDate(payment.paid_at)}</td>
            <td><strong>${escapeHtml(relatedName(payment, "customers", "customer_id"))}</strong></td>
            <td>${escapeHtml(payment.orders?.order_number || orderById(payment.order_id)?.order_number || "—")}</td>
            <td>${escapeHtml(titleCase(payment.method))}</td>
            <td><strong>${formatCurrency(payment.amount)}</strong></td>
            <td>${rowActions("payment", payment.id)}</td>
        </tr>
    `).join("");

    const total = appState.data.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthTotal = appState.data.payments
        .filter((payment) => String(payment.paid_at).startsWith(monthKey))
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    document.getElementById("paymentTotal").textContent = formatCurrency(total);
    document.getElementById("paymentMonth").textContent = formatCurrency(monthTotal);
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

    if (entity === "order") {
        fields = [
            { name: "customer_id", label: "Customer", type: "select", options: customerOptions, required: true },
            { name: "garment_type", label: "Garment / service", value: record.garment_type, placeholder: "e.g. Saree jacket", required: true, col: "col-md-6" },
            { name: "status", label: "Status", type: "select", options: ["pending", "in_progress", "ready", "completed", "cancelled"].map((status) => `<option value="${status}"${record.status === status ? " selected" : ""}>${titleCase(status)}</option>`).join(""), col: "col-md-6" },
            { name: "order_date", label: "Order date", type: "date", value: dateInputValue(record.order_date) || today, required: true, col: "col-md-6" },
            { name: "due_date", label: "Due date", type: "date", value: dateInputValue(record.due_date), required: true, col: "col-md-6" },
            { name: "total_amount", label: "Total amount (LKR)", type: "number", value: record.total_amount ?? "", min: 0, step: 0.01, required: true, col: "col-md-6" },
            { name: "advance_amount", label: "Advance paid (LKR)", type: "number", value: record.advance_amount ?? 0, min: 0, step: 0.01, col: "col-md-6" },
            { name: "notes", label: "Order notes", type: "textarea", value: record.notes, placeholder: "Design details, fabric, colour and special requests" }
        ];
    }

    if (entity === "measurement") {
        fields = [
            { name: "customer_id", label: "Customer", type: "select", options: customerOptions, required: true },
            { name: "profile_name", label: "Profile / garment", value: record.profile_name, placeholder: "e.g. Blouse", required: true },
            ...[
                ["chest", "Chest"], ["waist", "Waist"], ["hips", "Hips"], ["shoulder", "Shoulder"],
                ["sleeve_length", "Sleeve length"], ["garment_length", "Garment length"], ["neck", "Neck"], ["inseam", "Inseam"]
            ].map(([name, label]) => ({ name, label: `${label} (inches)`, type: "number", value: record[name] ?? "", min: 0, step: 0.01, col: "col-6" })),
            { name: "notes", label: "Additional notes", type: "textarea", value: record.notes }
        ];
    }

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
    document.getElementById("entityModalTitle").textContent = `${id ? "Edit" : "Add"} ${meta.title.toLowerCase()}`;
    document.getElementById("entityFormFields").innerHTML = getFormFields(entity, record || {});
    document.getElementById("saveEntityButton").textContent = id ? "Save changes" : `Add ${meta.title.toLowerCase()}`;
    entityModal.show();
}

function formPayload(form, entity) {
    const payload = Object.fromEntries(new FormData(form).entries());
    const numericFields = {
        order: ["total_amount", "advance_amount"],
        measurement: ["chest", "waist", "hips", "shoulder", "sleeve_length", "garment_length", "neck", "inseam"],
        inventory: ["quantity", "reorder_level", "unit_cost"],
        payment: ["amount"]
    }[entity] || [];

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
    const entity = appState.editingEntity;
    const meta = entityMeta[entity];
    const button = document.getElementById("saveEntityButton");
    const payload = formPayload(event.currentTarget, entity);

    button.disabled = true;
    button.textContent = "Saving…";

    let request = supabaseClient.from(meta.table);
    request = appState.editingId
        ? request.update(payload).eq("id", appState.editingId)
        : request.insert(payload);

    const { error } = await request;
    button.disabled = false;

    if (error) {
        button.textContent = "Try again";
        showError(error.message);
        return;
    }

    entityModal.hide();
    showToast(`${meta.title} ${appState.editingId ? "updated" : "added"} successfully.`);
    await loadAllData();
    navigateTo(meta.section);
}

async function deleteEntity(entity, id) {
    const meta = entityMeta[entity];
    if (!meta || !window.confirm(`Delete this ${meta.title.toLowerCase()}? This cannot be undone.`)) return;

    const { error } = await supabaseClient.from(meta.table).delete().eq("id", id);
    if (error) {
        showError(error.message);
        return;
    }

    showToast(`${meta.title} deleted.`);
    await loadAllData();
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
    primaryAction.dataset.entity = entity;
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
        const navButton = event.target.closest("[data-section]");
        const sectionLink = event.target.closest("[data-go-section]");
        const openButton = event.target.closest("[data-open-entity]");
        const rowButton = event.target.closest("[data-action]");

        if (navButton) navigateTo(navButton.dataset.section);
        if (sectionLink) navigateTo(sectionLink.dataset.goSection);
        if (openButton) openEntityModal(openButton.dataset.openEntity);
        if (rowButton?.dataset.action === "edit") openEntityModal(rowButton.dataset.entity, rowButton.dataset.id);
        if (rowButton?.dataset.action === "delete") deleteEntity(rowButton.dataset.entity, rowButton.dataset.id);
    });

    document.getElementById("primaryAction").addEventListener("click", (event) => openEntityModal(event.currentTarget.dataset.entity));
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
