// Paso 1: Importar la configuración y servicios compartidos desde firebase-config.js
import { db, auth, ADMIN_UID, appIdForPath } from './firebase-config.js';

// Paso 2: Importar solo las funciones de Firebase que se usan en ESTE archivo
import { 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot,
    query,
    where, 
    Timestamp,
    writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ------------------------------------------------------------------------------------
// El resto del código permanece casi igual, usando las variables importadas
// ------------------------------------------------------------------------------------

let currentLoggedInUser = null;
let eppInventoryCollectionRef;
let eppLoansCollectionRef; 
let allEppItems = []; // Variable para almacenar todos los EPP del inventario

// Elementos del DOM (Login, Logout, Info Usuario)
const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const logoutButton = document.getElementById('logoutButton');
const userIdDisplay = document.getElementById('userIdDisplay');
const authStatus = document.getElementById('authStatus');
const loginError = document.getElementById('loginError');

// Elementos del DOM (Formulario EPP)
const addEppFormSection = document.getElementById('addEppFormSection');
const addEppForm = document.getElementById('addEppForm');
const eppNameInput = document.getElementById('eppName');
const eppSizeInput = document.getElementById('eppSize'); 
const eppQuantityInput = document.getElementById('eppQuantity');
const eppMinStockInput = document.getElementById('eppMinStock');

// Elementos del DOM (Tabla Inventario y Filtro)
const eppTableBody = document.getElementById('eppTableBody');
const searchEppInput = document.getElementById('searchEppInput');

// Elementos del DOM (Sección Préstamos)
const loansSection = document.getElementById('loansSection');
const loanEppForm = document.getElementById('loanEppForm');
const eppToLoanSelect = document.getElementById('eppToLoanSelect');
const loanQuantityInput = document.getElementById('loanQuantity');
const loanedToInput = document.getElementById('loanedTo');
const loansTableBody = document.getElementById('loansTableBody');

// Elementos del DOM (Generales)
const loadingIndicator = document.getElementById('loadingIndicator');
const mainContent = document.getElementById('mainContent');
const errorMessage = document.getElementById('errorMessage');
const messageContainer = document.getElementById('messageContainer');

// --- Autenticación y Setup de Firestore ---
function setupFirebase() {
    // La línea "enableIndexedDbPersistence(db)" se movió a firebase-config.js, por lo que se elimina de aquí.

    if (ADMIN_UID && ADMIN_UID !== "PEGAR_AQUI_EL_UID_DEL_ADMINISTRADOR") {
        eppInventoryCollectionRef = collection(db, artifacts/${appIdForPath}/users/${ADMIN_UID}/epp_inventory);
        eppLoansCollectionRef = collection(db, artifacts/${appIdForPath}/users/${ADMIN_UID}/epp_loans);
    } else {
        errorMessage.textContent = "Error Crítico de Configuración: La constante ADMIN_UID no ha sido establecida en firebase-config.js. Por favor, edita el archivo y define tu User ID de Firebase. La aplicación no funcionará correctamente.";
        errorMessage.classList.remove('hidden');
        loadingIndicator.classList.add('hidden');
        return; 
    }

    onAuthStateChanged(auth, (user) => {
        currentLoggedInUser = user;
        const isAdmin = user && user.uid === ADMIN_UID;
        adjustAdminColumnsVisibility(isAdmin); 

        if (user) {
            userIdDisplay.textContent = Logueado como: ${user.email};
            authStatus.textContent = "Autenticado.";
            authStatus.classList.remove('text-red-500'); authStatus.classList.add('text-green-500');
            loginSection.classList.add('hidden');
            logoutButton.classList.remove('hidden');
            
            if (isAdmin) {
                addEppFormSection.classList.remove('hidden');
                loansSection.classList.remove('hidden'); 
                loadLoans(); 
            } else {
                addEppFormSection.classList.add('hidden');
                loansSection.classList.add('hidden'); 
                showTemporaryMessage("Cuenta sin permisos de administrador.", "warning");
            }
        } else {
            userIdDisplay.textContent = "Visitante";
            authStatus.textContent = "No autenticado.";
            authStatus.classList.add('text-red-500'); authStatus.classList.remove('text-green-500');
            loginSection.classList.remove('hidden');
            logoutButton.classList.add('hidden');
            addEppFormSection.classList.add('hidden');
            loansSection.classList.add('hidden'); 
        }
        loadInventory(); // Cargar inventario siempre, la vista se ajusta dentro
        mainContent.classList.remove('hidden');
        loadingIndicator.classList.add('hidden');
    });

    if (searchEppInput) {
        searchEppInput.addEventListener('input', () => {
            displayFilteredInventory(currentLoggedInUser && currentLoggedInUser.uid === ADMIN_UID);
        });
    }
}

// --- Manejo de Login/Logout ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const email = emailInput.value;
    const password = passwordInput.value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
    } catch (error) {
        console.error("Error de inicio de sesión:", error);
        loginError.textContent = Error: ${mapAuthError(error.code)};
        loginError.classList.remove('hidden');
    }
});

logoutButton.addEventListener('click', async () => {
    try { await signOut(auth); } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showTemporaryMessage(Error al cerrar sesión: ${error.message}, "error");
    }
});

function mapAuthError(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email': return 'Formato de correo inválido.';
        case 'auth/user-not-found': case 'auth/wrong-password': case 'auth/invalid-credential': return 'Correo o contraseña incorrectos.';
        default: return 'Error al intentar iniciar sesión.';
    }
}

// --- Lógica del Inventario EPP ---
function loadInventory() {
    if (ADMIN_UID === "PEGAR_AQUI_EL_UID_DEL_ADMINISTRADOR" || !eppInventoryCollectionRef) {
        if (!eppInventoryCollectionRef && ADMIN_UID !== "PEGAR_AQUI_EL_UID_DEL_ADMINISTRADOR") { 
             errorMessage.textContent = "Error: No se pudo conectar a la base de datos del inventario.";
             errorMessage.classList.remove('hidden');
        }
        const isAdminForColspan = currentLoggedInUser && currentLoggedInUser.uid === ADMIN_UID;
        eppTableBody.innerHTML = <tr><td colspan="${isAdminForColspan ? 7 : 5}" class="text-center py-4 px-6 text-gray-500">Inventario no disponible (configuración pendiente o error de conexión).</td></tr>;
        loadingIndicator.classList.add('hidden');
        return;
    }

    loadingIndicator.classList.remove('hidden');
    const q = query(eppInventoryCollectionRef); 

    onSnapshot(q, (snapshot) => {
        allEppItems = [];
        snapshot.forEach(doc => {
            allEppItems.push({ id: doc.id, ...doc.data() });
        });
        allEppItems.sort((a, b) => (a.name && b.name) ? a.name.localeCompare(b.name) : 0);
        
        const isAdmin = currentLoggedInUser && currentLoggedInUser.uid === ADMIN_UID;
        displayFilteredInventory(isAdmin);

        loadingIndicator.classList.add('hidden');
        if(!errorMessage.classList.contains('hidden') && !errorMessage.textContent.startsWith("Error Crítico de Configuración:")) {
            errorMessage.classList.add('hidden');
        }
    }, (error) => {
        console.error("Error al cargar inventario EPP: ", error);
        errorMessage.textContent = Error al cargar inventario EPP: ${error.message}.;
        errorMessage.classList.remove('hidden');
        loadingIndicator.classList.add('hidden');
    });
}

function displayFilteredInventory(isAdminView) {
    eppTableBody.innerHTML = ''; 
    if (isAdminView) { 
        eppToLoanSelect.innerHTML = '<option value="">Seleccione un EPP</option>'; 
    }

    const searchTerm = searchEppInput ? searchEppInput.value.toLowerCase().trim() : "";
    const filteredItems = searchTerm
        ? allEppItems.filter(item => 
            (item.name && item.name.toLowerCase().includes(searchTerm)) || 
            (item.size && item.size.toLowerCase().includes(searchTerm))
          )
        : [...allEppItems];

    const colCount = isAdminView ? 7 : 5; 
    if (filteredItems.length === 0) {
        const message = searchTerm ? "No hay EPP que coincidan con la búsqueda." : "No hay EPP registrados.";
        eppTableBody.innerHTML = <tr><td colspan="${colCount}" class="text-center py-4 px-6 text-gray-500">${message}</td></tr>;
    } else {
        filteredItems.forEach(item => {
            renderEppItem(item, isAdminView);
            if (isAdminView) { 
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = ${item.name || 'Nombre Desconocido'} (Talla: ${item.size || 'N/A'}) - Stock: ${item.quantity !== undefined ? item.quantity : 'N/A'};
                option.dataset.stock = item.quantity; 
                option.dataset.name = item.name;
                option.dataset.size = item.size || 'N/A';
                eppToLoanSelect.appendChild(option);
            }
        });
    }
}

function renderEppItem(item, isAdminView) {
    const tr = document.createElement('tr');
    tr.className = `border-b dark:border-gray-700 ${
        item.quantity <= item.minStock ? 'bg-red-100 dark:bg-red-800/50' :
        item.quantity <= item.minStock + (item.minStock * 0.2) ? 'bg-yellow-100 dark:bg-yellow-800/50' :
        'bg-white dark:bg-gray-800'
    }`;

    const stockStatus = item.quantity <= item.minStock 
        ? <span class="font-semibold text-red-600 dark:text-red-400">BAJO STOCK</span>
        : (item.quantity <= item.minStock + (item.minStock * 0.2) 
            ? <span class="font-semibold text-yellow-600 dark:text-yellow-400">PRÓXIMO A MÍNIMO</span>
            : <span class="font-semibold text-green-600 dark:text-green-400">OK</span>);

    let adminColumnsHTML = '';
    if (isAdminView) {
        adminColumnsHTML = `
            <td class="py-3 px-4 sm:px-6 text-center">
                <button data-id="${item.id}" data-action="decrease" class="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs sm:text-sm">-</button>
                <button data-id="${item.id}" data-action="increase" class="ml-1 px-2 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-xs sm:text-sm">+</button>
            </td>
            <td class="py-3 px-4 sm:px-6 text-center">
                <button data-id="${item.id}" data-action="delete" class="px-2 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-xs sm:text-sm">Eliminar</button>
            </td>
        `;
    }

    tr.innerHTML = `
        <td class="py-3 px-4 sm:px-6 font-medium text-gray-900 dark:text-white whitespace-nowrap">${item.name || 'Nombre Desconocido'}</td>
        <td class="py-3 px-4 sm:px-6 text-center">${item.size || 'N/A'}</td>
        <td class="py-3 px-4 sm:px-6 text-center">${item.quantity !== undefined ? item.quantity : 'N/A'}</td>
        <td class="py-3 px-4 sm:px-6 text-center">${item.minStock !== undefined ? item.minStock : 'N/A'}</td>
        <td class="py-3 px-4 sm:px-6 text-center">${stockStatus}</td>
        ${adminColumnsHTML} 
    `;
    eppTableBody.appendChild(tr);
}

addEppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentLoggedInUser || currentLoggedInUser.uid !== ADMIN_UID) {
        showTemporaryMessage("Error: Sin permisos.", "error"); return;
    }
    if (!eppInventoryCollectionRef) {
        showTemporaryMessage("Error: Base de datos no lista.", "error"); return;
    }

    const name = eppNameInput.value.trim();
    const size = eppSizeInput.value.trim(); 
    const quantity = parseInt(eppQuantityInput.value);
    const minStock = parseInt(eppMinStockInput.value);

    if (name && !isNaN(quantity) && quantity >= 0 && !isNaN(minStock) && minStock >= 0) {
        try {
            await addDoc(eppInventoryCollectionRef, { name, size, quantity, minStock, createdAt: Timestamp.now() });
            addEppForm.reset();
            showTemporaryMessage("EPP agregado.", "success");
        } catch (error) {
            console.error("Error al agregar EPP: ", error);
            showTemporaryMessage(Error: ${error.message}, "error");
        }
    } else {
        showTemporaryMessage("Datos inválidos.", "error");
    }
});

eppTableBody.addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON') {
        if (!currentLoggedInUser || currentLoggedInUser.uid !== ADMIN_UID) return;

        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        if (!eppInventoryCollectionRef) { showTemporaryMessage("Error: BD no lista.", "error"); return; }
        const itemRef = doc(eppInventoryCollectionRef, id);

        try {
            const itemDoc = await getDoc(itemRef);
            if (!itemDoc.exists()) { showTemporaryMessage("Error: Item no existe.", "error"); return; }
            const currentQuantity = itemDoc.data().quantity;

            if (action === 'increase') {
                await updateDoc(itemRef, { quantity: currentQuantity + 1 });
            } else if (action === 'decrease') {
                if (currentQuantity > 0) await updateDoc(itemRef, { quantity: currentQuantity - 1 });
                else showTemporaryMessage("Cantidad no puede ser < 0.", "warning");
            } else if (action === 'delete') {
                showConfirmationModal(¿Eliminar "${itemDoc.data().name}"?, async () => {
                    await deleteDoc(itemRef);
                    showTemporaryMessage("EPP eliminado.", "success");
                });
            }
        } catch (error) {
            console.error(`Error en acción ${action}: `, error);
            showTemporaryMessage(Error: ${error.message}, "error");
        }
    }
});

// --- Lógica de Préstamos ---
loanEppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentLoggedInUser || currentLoggedInUser.uid !== ADMIN_UID) {
        showTemporaryMessage("Error: Sin permisos para registrar préstamo.", "error");
        return;
    }
    if (!eppLoansCollectionRef || !eppInventoryCollectionRef) {
        showTemporaryMessage("Error: Base de datos de préstamos o inventario no está lista.", "error");
        return;
    }

    const selectedOption = eppToLoanSelect.options[eppToLoanSelect.selectedIndex];
    const eppId = selectedOption.value;
    const eppName = selectedOption.dataset.name;
    const eppSize = selectedOption.dataset.size;
    const currentStock = parseInt(selectedOption.dataset.stock);
    const quantityToLoan = parseInt(loanQuantityInput.value);
    const loanedTo = loanedToInput.value.trim();

    if (!eppId) { showTemporaryMessage("Validación Préstamo: Seleccione un EPP.", "warning"); return; }
    if (typeof eppName === 'undefined' || typeof eppSize === 'undefined') {
        showTemporaryMessage("Error de Datos Préstamo: Falta nombre o talla del EPP seleccionado.", "error"); return;
    }
    if (isNaN(quantityToLoan) || quantityToLoan <= 0) { showTemporaryMessage("Validación Préstamo: Cantidad a prestar inválida.", "warning"); return; }
    if (!loanedTo) { showTemporaryMessage("Validación Préstamo: Ingrese a quién se presta.", "warning"); return; }
    if (isNaN(currentStock)) { showTemporaryMessage("Error de Datos Préstamo: Stock actual del EPP no es un número.", "error"); return; }
    if (quantityToLoan > currentStock) { showTemporaryMessage(Validación Préstamo: Stock insuficiente. Disponible: ${currentStock}, Préstamo: ${quantityToLoan}, "error"); return; }

    const batch = writeBatch(db);
    const eppItemRef = doc(eppInventoryCollectionRef, eppId);
    const newLoanRef = doc(eppLoansCollectionRef); 

    batch.set(newLoanRef, {
        eppId: eppId, eppName: eppName, eppSize: eppSize,
        quantityLoaned: quantityToLoan, loanedTo: loanedTo,
        loanDate: Timestamp.now(), returned: false, returnedDate: null
    });
    batch.update(eppItemRef, { quantity: currentStock - quantityToLoan });

    try {
        await batch.commit();
        loanEppForm.reset();
        eppToLoanSelect.value = ""; 
        showTemporaryMessage("Préstamo registrado y stock actualizado.", "success");
    } catch (error) {
        console.error("Error al registrar préstamo (batch.commit fallido): ", error);
        showTemporaryMessage(Error al registrar préstamo: ${error.message}. Verifique la consola., "error");
    }
});

function loadLoans() {
    if (ADMIN_UID === "PEGAR_AQUI_EL_UID_DEL_ADMINISTRADOR" || !eppLoansCollectionRef) {
         if (!eppLoansCollectionRef && ADMIN_UID !== "PEGAR_AQUI_EL_UID_DEL_ADMINISTRADOR") { 
            errorMessage.textContent = "Error de Configuración: No se pudo inicializar la base de datos de préstamos.";
            errorMessage.classList.remove('hidden');
         }
         loansTableBody.innerHTML = <tr><td colspan="6" class="text-center py-4 px-6 text-gray-500">Préstamos no disponibles (configuración pendiente o error de conexión).</td></tr>;
         return;
    }
    
    const q = query(eppLoansCollectionRef, where("returned", "==", false));

    onSnapshot(q, (snapshot) => {
        loansTableBody.innerHTML = '';
        if (snapshot.empty) {
            loansTableBody.innerHTML = <tr><td colspan="6" class="text-center py-4 px-6 text-gray-500">No hay préstamos activos.</td></tr>;
            return;
        }
        snapshot.forEach(loanDoc => {
            renderLoanItem(loanDoc.id, loanDoc.data());
        });
    }, (error) => {
        console.error("Error al cargar préstamos: ", error);
        loansTableBody.innerHTML = <tr><td colspan="6" class="text-center py-4 px-6 text-red-500">Error al cargar préstamos.</td></tr>;
    });
}

function renderLoanItem(loanId, loanData) {
    const tr = document.createElement('tr');
    tr.className = 'border-b dark:border-gray-700 bg-white dark:bg-gray-800';
    
    const loanDate = loanData.loanDate instanceof Timestamp ? loanData.loanDate.toDate().toLocaleDateString() : 'Fecha inválida';

    tr.innerHTML = `
        <td class="py-3 px-4 sm:px-6">${loanData.eppName} (Talla: ${loanData.eppSize || 'N/A'})</td>
        <td class="py-3 px-4 sm:px-6 text-center">${loanData.quantityLoaned}</td>
        <td class="py-3 px-4 sm:px-6">${loanData.loanedTo}</td>
        <td class="py-3 px-4 sm:px-6 text-center">${loanDate}</td>
        <td class="py-3 px-4 sm:px-6 text-center font-semibold ${loanData.returned ? 'text-green-500' : 'text-yellow-500'}">
            ${loanData.returned ? 'Devuelto' : 'Prestado'}
        </td>
        <td class="py-3 px-4 sm:px-6 text-center">
            ${!loanData.returned ? <button data-id="${loanId}" data-eppid="${loanData.eppId}" data-qty="${loanData.quantityLoaned}" data-action="returnLoan" class="px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-xs sm:text-sm">Marcar Devuelto</button> : ''}
        </td>
    `;
    loansTableBody.appendChild(tr);
}

loansTableBody.addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.action === 'returnLoan') {
        if (!currentLoggedInUser || currentLoggedInUser.uid !== ADMIN_UID) return;

        const loanId = e.target.dataset.id;
        const eppIdToReturn = e.target.dataset.eppid;
        const quantityReturned = parseInt(e.target.dataset.qty);

        if (!eppLoansCollectionRef || !eppInventoryCollectionRef) {
            showTemporaryMessage("Error: Base de datos no lista.", "error"); return;
        }

        const batch = writeBatch(db);
        const loanRef = doc(eppLoansCollectionRef, loanId);
        const eppItemRef = doc(eppInventoryCollectionRef, eppIdToReturn);

        try {
            const eppItemDoc = await getDoc(eppItemRef);
            if (!eppItemDoc.exists()) {
                showTemporaryMessage("Error: EPP original no encontrado para reponer stock.", "error");
                return;
            }
            const currentEppStock = eppItemDoc.data().quantity;

            batch.update(loanRef, {
                returned: true,
                returnedDate: Timestamp.now()
            });
            batch.update(eppItemRef, { quantity: currentEppStock + quantityReturned });
            
            await batch.commit();
            showTemporaryMessage("Préstamo marcado como devuelto y stock actualizado.", "success");
        } catch (error) {
            console.error("Error al devolver préstamo: ", error);
            showTemporaryMessage(Error al devolver préstamo: ${error.message}, "error");
        }
    }
});


// --- Utilidades (Mensajes, Confirmación) ---
function showTemporaryMessage(message, type = 'info') {
    messageContainer.textContent = message;
    messageContainer.className = `p-3 mb-4 text-sm rounded-lg ${
        type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100' :
        type === 'error'   ? 'bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-100'     :
        type === 'warning' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-700 dark:text-yellow-100' :
                             'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100'
    }`;
    messageContainer.classList.remove('hidden');
    setTimeout(() => { messageContainer.classList.add('hidden'); }, 3000);
}

const confirmationModal = document.getElementById('confirmationModal');
const confirmationMessage = document.getElementById('confirmationMessage');
const confirmButton = document.getElementById('confirmButton');
const cancelButton = document.getElementById('cancelButton');
let confirmCallback = null;

function showConfirmationModal(message, callback) {
    confirmationMessage.textContent = message;
    confirmCallback = callback;
    confirmationModal.classList.remove('hidden');
}
confirmButton.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    confirmationModal.classList.add('hidden'); confirmCallback = null;
});
cancelButton.addEventListener('click', () => {
    confirmationModal.classList.add('hidden'); confirmCallback = null;
});

// --- Ajuste dinámico de visibilidad de columnas de admin ---
function adjustAdminColumnsVisibility(isAdminView) {
    const adminCols = document.querySelectorAll('.admin-col');
    adminCols.forEach(col => {
        col.style.display = isAdminView ? '' : 'none'; 
    });
}

// Inicializar la aplicación
setupFirebase();
