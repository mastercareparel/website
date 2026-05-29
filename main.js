window.addEventListener("DOMContentLoaded",()=>{

updateCartCount();

});

function updateCartCount(){

let email =
localStorage.getItem("userEmail");

let countElements =
document.querySelectorAll(".cart-count");

if(!email){

countElements.forEach(el=>{
el.innerText = "0";
});

return;
}

fetch("/api/cart/" + email)

.then(res=>res.json())

.then(data=>{

let total = 0;

if(data.cart){

data.cart.forEach(item=>{
total += item.quantity;
});

}

countElements.forEach(el=>{
el.innerText = total;
});

})
.catch(err=>{
console.log("Cart count error:",err);
});

}

const faqItems =
document.querySelectorAll(".faq-item");

faqItems.forEach(item => {

    const question =
    item.querySelector(".faq-question");

    question.addEventListener("click", () => {

        item.classList.toggle("active");

    });

});

const pickupFaq = document.querySelectorAll(".pickup-faq-question");

pickupFaq.forEach(button => {
    button.addEventListener("click", () => {

        const parent = button.parentElement;

        parent.classList.toggle("active");

    });
});

