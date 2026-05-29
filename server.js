require('dotenv').config();
const bcrypt = require("bcrypt");
const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));

/* SERVE WEBSITE FILES */
app.use(express.static(path.join(__dirname)));
/* REVIEW IMAGE UPLOAD */

const storage = multer.diskStorage({

destination:(req,file,cb)=>{

cb(null,"uploads/reviews/");

},

filename:(req,file,cb)=>{

cb(
null,
Date.now() +
"-" +
file.originalname
);

}

});

const upload =
multer({storage:storage});

app.use(
"/uploads",
express.static(
path.join(__dirname,"uploads")
)
);

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


/* TEST DATABASE CONNECTION */
db.getConnection((err, connection) => {

  if (err) {
    console.log("Database connection failed:", err);
  } 
  else {
    console.log("Database Connected Successfully");
    connection.release();
  }

});

/* ADD TO CART */
app.post("/api/add-to-cart",(req,res)=>{
console.log("ADD TO CART DATA:",req.body);
const {email, product_slug} = req.body;
const qty = req.body.qty || 1;

/* GET USER ID */

db.query(
`SELECT id FROM users WHERE email=?`,
[email],
(err,user)=>{

if(err){
console.log("USER ERROR:", err);
return res.json({success:false});
}

if(user.length === 0){
console.log("USER NOT FOUND");
return res.json({success:false});
}

const userId = user[0].id;

db.query(
`SELECT * FROM cart WHERE user_id=?`,
[userId],
(err,cart)=>{

if(err){
console.log("CART FETCH ERROR:", err);
return res.json({success:false});
}

if(cart.length === 0){

db.query(
`INSERT INTO cart (user_id,total) VALUES (?,0)`,
[userId],
(err,result)=>{

if(err){
console.log("CART INSERT ERROR:",err);
return res.json({success:false});
}

const cartId = result.insertId;

addItem(cartId);

});

}else{

addItem(cart[0].id);

}

});


function addItem(cartId){

db.query(
`SELECT id,price FROM products WHERE slug=?`,
[product_slug],
(err,product)=>{

if(err){
console.log("PRODUCT ERROR:",err);
return res.json({success:false});
}

if(product.length === 0){
return res.json({success:false});
}

const productId = product[0].id;

db.query(
`SELECT * FROM cart_items WHERE cart_id=? AND product_id=?`,
[cartId,productId],
(err,item)=>{
  if(err){
console.log(err);
return res.json({success:false});
}


if(item.length > 0){

db.query(
`UPDATE cart_items SET quantity = quantity + ? WHERE cart_id=? AND product_id=?`,
[qty, cartId, productId],
(err)=>{
if(err){
console.log(err);
return res.json({success:false});
}

res.json({success:true});
});

}else{

db.query(
`INSERT INTO cart_items (cart_id,product_id,quantity)
VALUES (?,?,?)`,
[cartId,productId,qty],
(err)=>{

if(err){
console.log("CART ITEM ERROR:", err);
return res.json({success:false});
}

let itemTotal = product[0].price * qty;

db.query(
`UPDATE cart 
SET total = total + ? 
WHERE id=?`,
[itemTotal, cartId],
(err)=>{

if(err){
console.log("TOTAL UPDATE ERROR:", err);
return res.json({success:false});
}

res.json({success:true});

});

}
);

}

});

});

}

});
});

app.get("/razorpay-key", (req, res) => {
  res.json({
    key: process.env.RAZORPAY_KEY_ID
  });
});

const Razorpay = require("razorpay");

const razorpay = new Razorpay({
key_id: process.env.RAZORPAY_KEY_ID,
key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post("/create-order", async (req, res) => {

try {

const { amount } = req.body;

const options = {
amount: amount * 100,
currency: "INR",
receipt: "receipt_" + Date.now()
};

const order =
await razorpay.orders.create(options);

res.json(order);

} catch (error) {

console.log("RAZORPAY ERROR:", error);

res.status(500).json({
success:false
});

}

});

app.get("/api/products", (req, res) => {

  const query = "SELECT * FROM products";

  db.query(query, (err, result) => {

    if (err) {
      console.log("Query Error:", err);

      return res.status(500).json({
        error: err.message,
        code: err.code
      });
    }

    res.json(result);

  });

});

app.post("/signup", async (req,res)=>{

const {name,email,password} = req.body;

const names = name.split(" ");
const first = names[0];
const last = names[1] || "";

try{

const hashedPassword = await bcrypt.hash(password,10);

const query = `
INSERT INTO users (first_name,last_name,username,email,password)
VALUES (?,?,?,?,?)
`;

db.query(
query,
[first,last,name,email,hashedPassword],
(err,result)=>{

if(err){
console.log("DB ERROR:",err);
return res.json({
success:false,
error:err
});
}

res.json({
success:true
});

}
);

}catch(err){

console.log(err);
res.json({success:false});

}

});

app.post("/login", (req, res) => {

const { email, password } = req.body;

db.query(
`SELECT * FROM users WHERE email = ?`,
[email],
async (err, result) => {

if (err) {
console.log(err);
return res.json({
success: false,
message: "Server error"
});
}

/* EMAIL NOT REGISTERED */

if (result.length === 0) {
return res.json({
success: false,
message: "Please register first"
});
}

const user = result[0];

const match = await bcrypt.compare(
password,
user.password
);

/* WRONG PASSWORD */

if (!match) {
return res.json({
success: false,
message: "Wrong password"
});
}

/* LOGIN SUCCESS */

res.json({
success: true,
message: "Login successful",
user: user
});

});

});

app.get("/api/product/:slug", (req,res)=>{

const slug = req.params.slug;

db.query(
`SELECT * FROM products WHERE slug = ?`,
[slug],
(err,product)=>{

if(err){
console.log(err);
return res.status(500).json({error:"database error"});
}

if(product.length === 0){
return res.status(404).json({error:"product not found"});
}

const productId = product[0].id;

db.query(
`SELECT highlight FROM product_highlights WHERE product_id = ?`,
[productId],
(err,highlights)=>{

db.query(
`SELECT spec_name,spec_value FROM product_specs WHERE product_id = ?`,
[productId],
(err,specs)=>{

db.query(
`SELECT image_url FROM product_images WHERE product_id = ?`,
[productId],
(err,images)=>{

res.json({
product:product[0],
highlights:highlights || [],
specs:specs || [],
images:images || []
});

});

});

});

});

});

app.get("/get-address/:email",(req,res)=>{

const email = req.params.email;

db.query(
`SELECT id FROM users WHERE email=?`,
[email],
(err,user)=>{

if(err){
console.log("USER ERROR:", err);
return res.json({success:false});
}

if(user.length === 0){
console.log("USER NOT FOUND");
return res.json({success:false});
}

const userId = user[0].id;

db.query(
`SELECT * FROM addresses WHERE user_id=? ORDER BY id DESC LIMIT 1`,
[userId],
(err,address)=>{

if(err){
return res.json({success:false});
}

res.json({
success:true,
address:address[0]
});

});

});

});

/* GET CART */
app.get("/api/cart/:email",(req,res)=>{

const email = req.params.email;

db.query(
`SELECT id FROM users WHERE email=?`,
[email],
(err,user)=>{

if(err){
console.log(err);
return res.json({
cart:[],
total:0
});
}

if(user.length === 0){
return res.json({
cart:[],
total:0
});
}

const userId = user[0].id;

db.query(
`SELECT * FROM cart WHERE user_id=?`,
[userId],
(err,cart)=>{

if(err || cart.length === 0){
return res.json({
cart:[],
total:0
});
}

const cartId = cart[0].id;

db.query(
`
SELECT
cart_items.id,
cart_items.quantity,
products.name,
products.price,
products.cover_image
FROM cart_items
JOIN products
ON cart_items.product_id =
products.id
WHERE cart_items.cart_id=?
`,
[cartId],
(err,items)=>{

if(err){
console.log(err);
return res.json({
cart:[],
total:0
});
}

let total = 0;

items.forEach(item=>{
total +=
item.price *
item.quantity;
});

res.json({
cart:items,
total:total
});

});

});

});

});

app.post("/save-address",(req,res)=>{

console.log("Save address API called:", req.body);

const {email,name,phone,address,address2,landmark,city,pin} = req.body;

db.query(
"SELECT id FROM users WHERE email=?",
[email],
(err,user)=>{

if(err){
console.log("USER SELECT ERROR:",err);
return res.json({success:false});
}

if(user.length === 0){
console.log("USER NOT FOUND");
return res.json({success:false});
}

const userId = user[0].id;

console.log("USER ID FOUND:", userId);

db.query(
`INSERT INTO addresses
(user_id,title,address_line_1,address_line_2,country,city,postal_code,landmark,phone_number)
VALUES (?,?,?,?,?,?,?,?,?)`,
[
userId,
name,
address,
address2,
"India",
city,
pin,
landmark,
phone
],
(err,result)=>{

if(err){
console.log("INSERT ERROR:",err);
return res.json({success:false});
}

console.log("ADDRESS INSERTED:", result);

res.json({success:true});

});

});

});

/* PLACE ORDER */

app.post("/place-order",(req,res)=>{

console.log("PLACE ORDER API CALLED");
console.log(req.body);

const {
email,
paymentId,
amount
} = req.body;



db.query(
`SELECT id FROM users WHERE email=?`,
[email],
(err,user)=>{

if(err){
console.log(err);
return res.json({success:false});
}

if(user.length === 0){
return res.json({success:false});
}

const userId = user[0].id;

db.query(
`SELECT * FROM cart WHERE user_id=?`,
[userId],
(err,cart)=>{

if(err || cart.length === 0){
return res.json({success:false});
}

const cartId = cart[0].id;
const total = cart[0].total;

db.query(
`INSERT INTO order_details
(user_id,payment_id,total)
VALUES (?,?,?)`,
[userId,paymentId,total],
(err,result)=>{

if(err){
console.log("ORDER ERROR:",err);
return res.json({success:false});
}

const orderId = result.insertId;

/* PAYMENT TABLE */

db.query(
`INSERT INTO payment_details
(order_id,amount,provider,status)
VALUES (?,?,?,?)`,
[
orderId,
amount,
"Razorpay",
"success"
],
(err)=>{

if(err){
console.log("PAYMENT INSERT ERROR:", err);
return res.json({success:false});
}

if(err){
console.log(err);
}

/* GET CART ITEMS */

db.query(
`
SELECT
cart_items.product_id,
cart_items.quantity,
products.price
FROM cart_items
JOIN products
ON cart_items.product_id =
products.id
WHERE cart_items.cart_id=?
`,
[cartId],
(err,items)=>{
console.log("CART ITEMS:", items);

if(err){
console.log(err);
return res.json({success:false});
}

let done = 0;

items.forEach(item=>{

db.query(
`
INSERT INTO order_item
(order_id,product_id,quantity,price)
VALUES (?,?,?,?)
`,
[
orderId,
item.product_id,
item.quantity,
item.price
],
(err)=>{

if(err){
console.log("ORDER ITEM ERROR:", err);
}

done++;

if(done === items.length){

/* CLEAR CART */

db.query(
`DELETE FROM cart_items
WHERE cart_id=?`,
[cartId]
);

db.query(
`DELETE FROM cart
WHERE id=?`,
[cartId]
);

res.json({
success:true
});

}

});

});

});

});

});

});

});

});

/* SUBMIT REVIEW */

app.post(
"/submit-review",
upload.array("images",5),
(req,res)=>{

console.log("SUBMIT REVIEW API");
console.log("BODY:", req.body);
console.log("FILES:", req.files);

const customer_name =
req.body.customer_name;

const rating =
req.body.rating;

const review =
req.body.review;

const product_slug =
req.body.product_slug;

db.query(
`SELECT id FROM products WHERE slug=?`,
[product_slug],
(err,product)=>{

if(err){
console.log(err);
return res.json({success:false});
}

if(product.length === 0){
return res.json({success:false});
}

const productId = product[0].id;

/* CHECK EXISTING REVIEW */

db.query(
`
SELECT id
FROM product_reviews
WHERE customer_name=?
AND product_id=?
LIMIT 1
`,
[
customer_name,
productId
],
(err,existingReview)=>{

if(err){
console.log(err);
return res.json({
success:false
});
}

if(existingReview.length > 0){

return res.json({
success:false,
message:"already_reviewed"
});

}

/* INSERT REVIEW */

const imagePath =
req.files && req.files.length > 0
? "uploads/reviews/" + req.files[0].filename
: null;

db.query(
`
INSERT INTO product_reviews
(customer_name,product_id,rating,review,image_url)
VALUES (?,?,?,?,?)
`,
[
customer_name,
productId,
rating,
review,
imagePath
],
(err)=>{

if(err){
console.log(
"REVIEW INSERT ERROR:",
err
);

return res.json({
success:false
});
}

res.json({
success:true
});

});

});

});

});

/* GET REVIEWS */

app.get("/reviews/:slug",(req,res)=>{

const slug = req.params.slug;

db.query(
`SELECT id FROM products WHERE slug=?`,
[slug],
(err,product)=>{

if(err){
console.log(err);
return res.json({success:false});
}

if(product.length === 0){
return res.json({
success:false
});
}

const productId =
product[0].id;

db.query(
`
SELECT
customer_name,
rating,
review,
image_url,
created_at
FROM product_reviews
WHERE product_id=?
ORDER BY id DESC
`,
[productId],
(err,reviews)=>{

if(err){
console.log(err);
return res.json({success:false});
}

res.json({
success:true,
reviews:reviews
});

});

});

});

/* CHECK PURCHASE */

app.get("/check-purchase/:email/:slug",(req,res)=>{
console.log("CHECK PURCHASE API");
console.log(req.params);

const email = req.params.email;
const slug = req.params.slug;

db.query(
`SELECT id FROM users WHERE email=?`,
[email],
(err,user)=>{

if(err || user.length === 0){
return res.json({
purchased:false
});
}

const userId = user[0].id;

db.query(
`SELECT id FROM products WHERE slug=?`,
[slug],
(err,product)=>{

if(err || product.length === 0){
return res.json({
purchased:false
});
}

const productId = product[0].id;

db.query(
`
SELECT order_item.id
FROM order_item
JOIN order_details
ON order_item.order_id =
order_details.id
WHERE
order_details.user_id=?
AND
order_item.product_id=?
LIMIT 1
`,
[userId, productId],
(err,result)=>{

if(err){
console.log(err);
return res.json({
purchased:false
});
}

res.json({
purchased:
result.length > 0
});

});

});

});

});

/* MY ORDERS */

app.get("/my-orders/:email",(req,res)=>{

const email = req.params.email;

db.query(
`SELECT id FROM users WHERE email=?`,
[email],
(err,user)=>{

if(err){
console.log(err);
return res.json({success:false});
}

if(user.length === 0){
return res.json({success:false});
}

const userId = user[0].id;

db.query(
`
SELECT
order_details.id,
order_details.total,
order_details.payment_id,
order_details.created_at,
payment_details.status
FROM order_details
LEFT JOIN payment_details
ON order_details.id =
payment_details.order_id
WHERE order_details.user_id=?
ORDER BY order_details.id DESC
`,
[userId],
(err,orders)=>{

if(err){
console.log(err);
return res.json({success:false});
}

if(orders.length === 0){
return res.json({
success:true,
orders:[]
});
}

let completed = 0;

orders.forEach(order=>{

db.query(
`
SELECT
products.name,
products.cover_image,
order_item.quantity,
order_item.price
FROM order_item
JOIN products
ON order_item.product_id =
products.id
WHERE order_item.order_id=?
`,
[order.id],
(err,items)=>{

order.items = items || [];

completed++;

if(completed === orders.length){

res.json({
success:true,
orders:orders
});

}

});

});

});

});

});

/* CONTACT FORM */
/* CONTACT FORM */

app.post("/contact-message",(req,res)=>{

console.log("CONTACT API CALLED");
console.log(req.body);

const {
name,
email,
phone,
message
} = req.body;

db.query(
`
INSERT INTO contact_messages
(name,email,phone,message)
VALUES (?,?,?,?)
`,
[
name,
email,
phone,
message
],
(err,result)=>{

if(err){

console.log(
"CONTACT INSERT ERROR:",
err
);

return res.status(500).json({
success:false,
error:err.message
});

}

res.json({
success:true
});

});

});

/* UPDATE CART QTY */

app.post("/api/update-cart",(req,res)=>{

const {itemId,change} = req.body;

db.query(
`
SELECT
cart_items.quantity,
products.price,
cart_items.cart_id
FROM cart_items
JOIN products
ON cart_items.product_id =
products.id
WHERE cart_items.id=?
`,
[itemId],
(err,result)=>{

if(err || result.length === 0){
return res.json({success:false});
}

const item = result[0];

const newQty =
item.quantity + change;

if(newQty <= 0){
return res.json({success:false});
}

db.query(
`UPDATE cart_items
SET quantity=?
WHERE id=?`,
[newQty,itemId],
(err)=>{

if(err){
return res.json({success:false});
}

db.query(
`
SELECT
SUM(cart_items.quantity * products.price)
AS total
FROM cart_items
JOIN products
ON cart_items.product_id =
products.id
WHERE cart_items.cart_id=?
`,
[item.cart_id],
(err,totalResult)=>{

if(err){
return res.json({success:false});
}

const newTotal =
totalResult[0].total || 0;

db.query(
`
UPDATE cart
SET total=?
WHERE id=?
`,
[newTotal,item.cart_id],
(err)=>{

if(err){
return res.json({success:false});
}

res.json({
success:true
});

});

});

});

});

});


/* DELETE CART ITEM */

app.post("/api/remove-cart-item",(req,res)=>{

const {itemId} = req.body;

db.query(
`
SELECT
cart_items.quantity,
products.price,
cart_items.cart_id
FROM cart_items
JOIN products
ON cart_items.product_id =
products.id
WHERE cart_items.id=?
`,
[itemId],
(err,result)=>{

if(err || result.length === 0){
return res.json({success:false});
}

const item = result[0];

const deduction =
item.quantity *
item.price;

db.query(
`
DELETE FROM cart_items
WHERE id=?
`,
[itemId],
(err)=>{

if(err){
return res.json({success:false});
}

db.query(
`
SELECT
SUM(cart_items.quantity * products.price)
AS total
FROM cart_items
JOIN products
ON cart_items.product_id =
products.id
WHERE cart_items.cart_id=?
`,
[item.cart_id],
(err,totalResult)=>{

if(err){
return res.json({success:false});
}

const newTotal =
totalResult[0].total || 0;

db.query(
`
UPDATE cart
SET total=?
WHERE id=?
`,
[newTotal,item.cart_id],
(err)=>{

if(err){
return res.json({success:false});
}

res.json({
success:true
});

});

});

});

});

});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

