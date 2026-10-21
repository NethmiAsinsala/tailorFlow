const logoutButton = document.getElementById("logoutButton");
const syncStatus = document.getElementById("syncStatus");

const statElements = {
    todayOrders: document.getElementById("todayOrders"),
    pendingOrders: document.getElementById("pendingOrders"),
    customerCount: document.getElementById("customerCount"),
    paymentsReceived: document.getElementById("paymentsReceived")
};

function finishLoading() {
    Object.values(statElements).forEach((element) => {
        element.classList.remove("loading-shimmer");
    });
}

function setDashboardDate() {
    const now = new Date();
    document.getElementById("todayDate").textContent = new Intl.DateTimeFormat("en-LK", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(now);

    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("welcomeTitle").textContent = greeting;
}

function getLocalDayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start: start.toISOString(), end: end.toISOString() };
}

async function getCount(table, configureQuery) {
    let query = supabaseClient.from(table).select("*", { count: "exact", head: true });
    query = configureQuery ? configureQuery(query) : query;

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
}

function withTimeout(request, timeoutMs = 6000) {
    return Promise.race([
        request,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
        })
    ]);
}

async function loadDashboardStats() {
    const { start, end } = getLocalDayRange();

    const requests = await Promise.allSettled([
        withTimeout(getCount("orders", (query) => query.gte("created_at", start).lt("created_at", end))),
        withTimeout(getCount("orders", (query) => query.in("status", ["pending", "in_progress"]))),
        withTimeout(getCount("customers")),
        withTimeout(supabaseClient
            .from("payments")
            .select("amount"))
    ]);

    statElements.todayOrders.textContent = requests[0].status === "fulfilled" ? requests[0].value : 0;
    statElements.pendingOrders.textContent = requests[1].status === "fulfilled" ? requests[1].value : 0;
    statElements.customerCount.textContent = requests[2].status === "fulfilled" ? requests[2].value : 0;

    let paymentTotal = 0;
    if (requests[3].status === "fulfilled" && !requests[3].value.error) {
        paymentTotal = requests[3].value.data.reduce((total, payment) => {
            return total + Number(payment.amount || 0);
        }, 0);
    }

    statElements.paymentsReceived.textContent = new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: "LKR",
        maximumFractionDigits: 0
    }).format(paymentTotal);

    finishLoading();

    const successfulRequests = requests.filter((request, index) => {
        if (request.status !== "fulfilled") return false;
        return index !== 3 || !request.value.error;
    }).length;

    syncStatus.textContent = successfulRequests === requests.length ? "Live data" : "Setup in progress";
}

async function initializeDashboard() {
    setDashboardDate();

    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error || !session) {
        window.location.replace("login.html");
        return;
    }

    await loadDashboardStats();
}

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out…";

    await supabaseClient.auth.signOut();
    window.location.replace("login.html");
});

supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
        window.location.replace("login.html");
    }
});

initializeDashboard().catch((error) => {
    console.error("Dashboard initialization failed:", error);
    finishLoading();
    syncStatus.textContent = "Could not sync";
});
