const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    loginMessage.className = "alert d-none";
    loginMessage.textContent = "";

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        console.error("Login error:", error);

        loginMessage.className = "alert alert-danger";
        loginMessage.textContent = error.message;

        loginButton.disabled = false;
        loginButton.textContent = "Login";

        return;
    }

    console.log("Login successful:", data);

    loginMessage.className = "alert alert-success";
    loginMessage.textContent = "Login successful!";

    loginButton.textContent = "Success";
});