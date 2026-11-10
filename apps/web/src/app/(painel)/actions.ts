"use server";

import { revalidatePath } from "next/cache";
import { cancelReminder, deleteBill, deleteNote, deleteTransaction, payBill } from "@/lib/db";
import { requireUser } from "@/lib/session";

const id = (form: FormData) => String(form.get("id") ?? "");

export async function removeTransaction(form: FormData) {
  const user = await requireUser();
  await deleteTransaction(user.id, id(form));
  revalidatePath("/", "layout");
}

export async function removeNote(form: FormData) {
  const user = await requireUser();
  await deleteNote(user.id, id(form));
  revalidatePath("/notas");
}

export async function removeReminder(form: FormData) {
  const user = await requireUser();
  await cancelReminder(user.id, id(form));
  revalidatePath("/lembretes");
}

export async function markBillPaid(form: FormData) {
  const user = await requireUser();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(new Date());
  await payBill(user.id, id(form), today);
  revalidatePath("/", "layout");
}

export async function removeBill(form: FormData) {
  const user = await requireUser();
  await deleteBill(user.id, id(form));
  revalidatePath("/", "layout");
}
