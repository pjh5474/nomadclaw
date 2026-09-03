import { tool } from "ai";
import z from "zod";
import { getMenuCatalog, getMenuItemById, MENU, STORES } from "./constants.ts";

export type CartLine = {
	id: string;
	name: string;
	price: number;
	quantity: number;
};

export type CartAccess = {
	getCart: () => CartLine[];
	setCart: (cart: CartLine[]) => void;
};

const menuItemIds = MENU.map((item) => item.id) as [string, ...string[]];

export function cartSubtotal(cart: CartLine[]) {
	return cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

export const getStore = tool({
	title: "getStore",
	description: "Get the store information",
	inputSchema: z.object({}),
	execute: async () => STORES,
});

export const getMenu = tool({
	title: "getMenu",
	description:
		"Returns the full menu. Read names, sizes, and descriptions, then decide which `id` matches what the user wants before calling addToCart.",
	inputSchema: z.object({}),
	execute: async () => getMenuCatalog(),
});

export const addToCart = (cartAccess: CartAccess) =>
	tool({
		title: "addToCart",
		description:
			"Add items to the cart. You choose the menu `itemId` (from getMenu) and quantity based on the user's request — do not guess item names as free text.",
		inputSchema: z.object({
			itemId: z.enum(menuItemIds).meta({
				description:
					"The menu item `id` from getMenu that best matches the user's order",
			}),
			quantity: z.number().int().min(1).optional().meta({
				description: "How many to add (defaults to 1)",
			}),
		}),
		execute: async ({ itemId, quantity = 1 }) => {
			const menuItem = getMenuItemById(itemId);

			if (!menuItem) {
				return {
					success: false as const,
					message: `Unknown itemId "${itemId}". Call getMenu and pick a valid id.`,
				};
			}

			const cart = [...cartAccess.getCart()];
			const existing = cart.find((line) => line.id === menuItem.id);

			if (existing) {
				existing.quantity += quantity;
			} else {
				cart.push({
					id: menuItem.id,
					name: menuItem.name,
					price: menuItem.price,
					quantity,
				});
			}

			cartAccess.setCart(cart);

			return {
				success: true as const,
				added: {
					id: menuItem.id,
					name: menuItem.name,
					quantity,
					price: menuItem.price,
				},
				currency: "KRW" as const,
				cart,
				subtotal: cartSubtotal(cart),
			};
		},
	});

export const viewCart = (cartAccess: CartAccess) =>
	tool({
		title: "viewCart",
		description: "View the items in the cart",
		inputSchema: z.object({}),
		execute: async () => {
			const cart = cartAccess.getCart();
			return {
				items: cart,
				subtotal: cartSubtotal(cart),
				currency: "KRW" as const,
			};
		},
	});

export const getLocation = tool({
	title: "getLocation",
	description: "Use this to get the user location",
	inputSchema: z.object({}),
});

export const placeOrder = (cartAccess: CartAccess) =>
	tool({
		title: "placeOrder",
		description:
			"Place an order for everything currently in the cart. The cart is cleared after a successful order. You must first call getStore to get the store information. Then make a decision based on the store information and the user's request.",
		inputSchema: z.object({
			storeName: z.string().meta({
				description: "The store fulfilling the order",
			}),
			location: z.string().meta({
				description: "Delivery address or pickup location description",
			}),
		}),
		execute: async ({ storeName, location }) => {
			const items = [...cartAccess.getCart()];

			if (items.length === 0) {
				return {
					success: false as const,
					message: "Cart is empty. Add items before placing an order.",
				};
			}

			const total = cartSubtotal(items);
			const order = {
				items,
				storeName,
				location,
				total,
				currency: "KRW" as const,
			};

			cartAccess.setCart([]);

			return {
				success: true as const,
				order,
				message: `Order placed at ${storeName} (${location}) — ${total.toLocaleString("ko-KR")}원`,
			};
		},
		needsApproval: true,
	});
