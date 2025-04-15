import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import Order from "../models/order.js";
import Stripe from "stripe";

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Create Stripe Checkout Session
export const stripeCheckoutSession = catchAsyncErrors(
  async (req, res, next) => {
    const body = req.body;

    const line_items = body.orderItems.map((item) => ({
      price_data: {
        currency: "inr",
        product_data: {
          name: item.name,
          images: [item.image],
          metadata: { productId: item.product },
        },
        unit_amount: item.price * 100,
      },
      tax_rates: ["txr_1RDLeWQr3CAf6QPwvEWiJT5f"],
      quantity: item.quantity,
    }));

    const shippingInfo = body.shippingInfo;

    const shipping_rate =
      body.itemsPrice >= 1000
        ? "shr_1RD9c3Qr3CAf6QPwKYThAQMc"
        : "shr_1RDLXhQr3CAf6QPwzn3AYy1M";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      success_url: `${process.env.FRONTEND_URL}/me/orders?order_success=true`,
      cancel_url: `${process.env.FRONTEND_URL}`,
      customer_email: req.user?.email,
      client_reference_id: req.user?._id?.toString(),
      mode: "payment",
      metadata: {
        address: shippingInfo.address,
        city: shippingInfo.city,
        country: shippingInfo.country,
        phoneNo: shippingInfo.phoneNo,
        zipCode: shippingInfo.zipCode,
        state: shippingInfo.state,
        itemsPrice: body.itemsPrice,
      },
      shipping_options: [{ shipping_rate }],
      line_items,
    });

    res.status(200).json({ url: session.url });
  }
);

// Helper: Fix async bug with Promise.all
const getOrderItems = async (line_items) => {
  return await Promise.all(
    line_items?.data?.map(async (item) => {
      const product = await stripe.products.retrieve(item.price.product);
      return {
        product: product.metadata.productId,
        name: product.name,
        price: item.price.unit_amount_decimal / 100,
        quantity: item.quantity,
        image: product.images[0],
      };
    })
  );
};

// Stripe Webhook Handler
export const stripeWebhook = catchAsyncErrors(async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const line_items = await stripe.checkout.sessions.listLineItems(
        session.id
      );

      const orderItems = await getOrderItems(line_items);

      const shippingInfo = {
        address: session.metadata.address,
        city: session.metadata.city,
        country: session.metadata.country,
        phoneNo: session.metadata.phoneNo,
        zipCode: session.metadata.zipCode,
        state: session.metadata.state,
      };

      const paymentInfo = {
        id: session.payment_intent,
        status: session.payment_status,
      };

      const orderData = {
        shippingInfo,
        orderItems,
        itemsPrice: Number(session.metadata.itemsPrice),
        taxAmount: session.total_details.amount_tax / 100,
        shippingAmount: session.total_details.amount_shipping / 100,
        totalAmount: session.amount_total / 100,
        paymentInfo,
        paymentMethod: "Card",
        user: session.client_reference_id,
      };

      await Order.create(orderData);

      return res.status(200).json({ success: true });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error(" Webhook Error:", error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});
