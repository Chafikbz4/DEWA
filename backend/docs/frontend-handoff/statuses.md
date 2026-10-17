# Status dictionaries (generated)

Labels come from `src/i18n/{fr,ar}.json` (`labels.*`). The API already returns localized labels where useful (e.g. the order timeline); use these tables for badges, filters and empty states. Order transitions: [../06-order-state-machine.md](../06-order-state-machine.md).

## Request (`requests.status`)

| Value | fr | ar | Meaning for the user |
|---|---|---|---|
| `REQUEST_SUBMITTED` | Envoyée | مُرسل | Just created; pharmacies are being notified. |
| `AWAITING_PHARMACY_RESPONSE` | En attente des pharmacies | بانتظار الصيدليات | Sent to pharmacies; waiting for offers. |
| `CLARIFICATION_REQUIRED` | Question de la pharmacie | سؤال من الصيدلية | A pharmacist asked a question – answer in the conversation. |
| `OFFER_AVAILABLE` | Proposition disponible | يتوفر عرض | At least one offer received – compare and accept one. |
| `OFFER_ACCEPTED` | Proposition acceptée | تم قبول عرض | An offer was accepted; follow the order. |
| `EXPIRED` | Expirée | منتهي الصلاحية | No offer accepted in time; create a new request if needed. |
| `CANCELLED` | Annulée | ملغى | Cancelled by the patient or because the order ended without hand-over. |

## Offer (`offers.status`)

| Value | fr | ar | Meaning for the user |
|---|---|---|---|
| `DRAFT` | Brouillon | مسودة | Pharmacy is preparing the offer (patient never sees drafts). |
| `SENT` | Envoyée | مُرسل | Visible to the patient; can be accepted until valid_until. |
| `ACCEPTED` | Acceptée | مقبول | Chosen by the patient – an order was created. |
| `REJECTED` | Non retenue | غير مختار | Another offer was accepted or the patient declined. |
| `EXPIRED` | Expirée | منتهي الصلاحية | Validity period ended. |
| `WITHDRAWN` | Retirée | مسحوب | Withdrawn by the pharmacy. |

## Order (`orders.status`)

| Value | fr | ar | Meaning for the user |
|---|---|---|---|
| `AWAITING_PAYMENT` | En attente de paiement | بانتظار الدفع | Le pharmacien a validé votre commande. Vous pouvez payer. |
| `PAYMENT_PENDING` | Paiement en cours | الدفع قيد المعالجة | Votre paiement est en cours de vérification. |
| `PAYMENT_CONFIRMED` | Paiement confirmé | تم تأكيد الدفع | Votre paiement est confirmé. |
| `PHARMACIST_VALIDATION_PENDING` | Validation par le pharmacien | مصادقة الصيدلي | Un pharmacien vérifie votre commande et votre ordonnance. |
| `PREPARING` | En préparation | قيد التحضير | La pharmacie prépare votre commande. |
| `READY_FOR_PICKUP` | Prête | جاهز | Votre commande est prête. |
| `DELIVERY_ASSIGNED` | Livreur assigné | تم تعيين عامل التوصيل | Un livreur va récupérer votre commande. |
| `PICKED_UP` | Récupérée par le livreur | استلمه عامل التوصيل | Le livreur a récupéré votre commande. |
| `OUT_FOR_DELIVERY` | En cours de livraison | في الطريق | Votre commande est en route. |
| `DELIVERED` | Livrée | تم التسليم | Votre commande a été livrée. |
| `COMPLETED` | Retirée | تم الاستلام | Vous avez retiré votre commande. |
| `CANCELLED` | Annulée | ملغى | La commande a été annulée. |
| `REFUND_PENDING` | Remboursement en cours | الاسترداد قيد المعالجة | Le remboursement est en cours de traitement. |
| `REFUNDED` | Remboursée | تم الاسترداد | Le remboursement a été effectué. |
| `FAILED` | Livraison échouée | فشل التوصيل | La livraison n’a pas pu être effectuée ; la commande retourne à la pharmacie. |

## Payment (`payments.status`)

| Value | fr | ar | Meaning for the user |
|---|---|---|---|
| `INITIATED` | Initié | تمت المباشرة | Payment attempt created; redirect pending. |
| `PENDING` | En cours | قيد المعالجة | Waiting for the bank – poll GET /payments/:id/status; never show success yet. |
| `CONFIRMED` | Confirmé | مؤكد | Verified server-side with the provider – show success and refetch the order. |
| `FAILED` | Échoué | فاشل | Declined, cancelled or provider error – the patient may retry. |
| `CANCELLED` | Annulé | ملغى | Attempt abandoned. |
| `REFUND_PENDING` | Remboursement en cours | الاسترداد قيد المعالجة | A refund is being processed. |
| `REFUNDED` | Remboursé | تم الاسترداد | Fully refunded. |

## Delivery (`deliveries.status`)

| Value | fr | ar | Meaning for the user |
|---|---|---|---|
| `AVAILABLE` | En attente d’un livreur | بانتظار عامل توصيل | Waiting for a driver to accept the job. |
| `ASSIGNED` | Livreur assigné | تم تعيين عامل التوصيل | A driver accepted; going to the pharmacy. |
| `PICKED_UP` | Récupérée | تم الاستلام | Parcel collected from the pharmacy (pickup code). |
| `OUT_FOR_DELIVERY` | En route | في الطريق | On the way – live position available; give the delivery code at the door. |
| `DELIVERED` | Livrée | تم التسليم | Delivered with a valid proof. |
| `FAILED` | Échec | فشل | Delivery failed (reason shown); parcel returns to the pharmacy. |
| `RETURNED` | Retournée à la pharmacie | أُعيد إلى الصيدلية | Back at the pharmacy; a refund request was opened. |
| `CANCELLED` | Annulée | ملغى | Order cancelled before pickup. |
