# Error codes

> **Generated** by `npm run docs:errors` from `src/common/errors/error-codes.ts` and `src/i18n/*.json`.

Every error response has `error.code` (stable, switch on it), `error.message_key` (`errors.<CODE>`),
`error.message` (translated from `Accept-Language`) and `error.details` (e.g. field errors for `VALIDATION_FAILED`).

| Code | HTTP | Message (fr) | Message (ar) |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Certaines données envoyées sont invalides. | بعض البيانات المرسلة غير صالحة. |
| `BAD_REQUEST` | 400 | Requête invalide. | طلب غير صالح. |
| `UNAUTHORIZED` | 401 | Authentification requise. | يجب تسجيل الدخول. |
| `FORBIDDEN` | 403 | Accès refusé. | تم رفض الوصول. |
| `NOT_FOUND` | 404 | Ressource introuvable. | المورد غير موجود. |
| `ROUTE_NOT_FOUND` | 404 | Cette route n'existe pas. | هذا المسار غير موجود. |
| `CONFLICT` | 409 | Conflit avec l'état actuel de la ressource. | تعارض مع الحالة الحالية للمورد. |
| `PAYLOAD_TOO_LARGE` | 413 | La requête est trop volumineuse. | حجم الطلب كبير جدًا. |
| `RATE_LIMITED` | 429 | Trop de requêtes. Veuillez réessayer plus tard. | طلبات كثيرة جدًا. يرجى المحاولة لاحقًا. |
| `INTERNAL_ERROR` | 500 | Une erreur interne est survenue. Veuillez réessayer. | حدث خطأ داخلي. يرجى المحاولة مرة أخرى. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Identifiant ou mot de passe incorrect. | المعرّف أو كلمة المرور غير صحيحة. |
| `AUTH_ACCOUNT_LOCKED` | 401 | Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans {minutes} minutes. | تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متعددة. أعد المحاولة بعد {minutes} دقيقة. |
| `AUTH_TOKEN_MISSING` | 401 | Jeton d'accès manquant. | رمز الوصول مفقود. |
| `AUTH_TOKEN_INVALID` | 401 | Jeton d'accès invalide. | رمز الوصول غير صالح. |
| `AUTH_TOKEN_EXPIRED` | 401 | Jeton d'accès expiré. | انتهت صلاحية رمز الوصول. |
| `AUTH_SESSION_REVOKED` | 401 | Cette session a été fermée. Veuillez vous reconnecter. | تم إغلاق هذه الجلسة. يرجى تسجيل الدخول من جديد. |
| `AUTH_REFRESH_INVALID` | 401 | Session invalide ou expirée. Veuillez vous reconnecter. | الجلسة غير صالحة أو منتهية. يرجى تسجيل الدخول من جديد. |
| `AUTH_REFRESH_REUSED` | 401 | Activité suspecte détectée : toutes les sessions liées ont été fermées. Veuillez vous reconnecter. | تم رصد نشاط مشبوه: أُغلقت جميع الجلسات المرتبطة. يرجى تسجيل الدخول من جديد. |
| `AUTH_DEVICE_MISMATCH` | 401 | Cette session est liée à un autre appareil. | هذه الجلسة مرتبطة بجهاز آخر. |
| `AUTH_CONSENT_REQUIRED` | 400 | Vous devez accepter les conditions d'utilisation et la politique de confidentialité. | يجب الموافقة على شروط الاستخدام وسياسة الخصوصية. |
| `AUTH_CONSENT_VERSION_OUTDATED` | 400 | La version des conditions acceptée n'est plus à jour. | نسخة الشروط التي وافقت عليها لم تعد محدّثة. |
| `AUTH_PASSWORD_INCORRECT` | 400 | Le mot de passe actuel est incorrect. | كلمة المرور الحالية غير صحيحة. |
| `AUTH_PASSWORD_REUSED` | 400 | Le nouveau mot de passe doit être différent de l'ancien. | يجب أن تختلف كلمة المرور الجديدة عن القديمة. |
| `AUTH_IDENTIFIER_REQUIRED` | 400 | Un e-mail ou un numéro de téléphone est requis. | البريد الإلكتروني أو رقم الهاتف مطلوب. |
| `AUTH_SESSION_NOT_FOUND` | 404 | Session introuvable. | الجلسة غير موجودة. |
| `OTP_INVALID` | 400 | Code invalide ou expiré. | الرمز غير صالح أو منتهي الصلاحية. |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | Trop de tentatives. Demandez un nouveau code. | محاولات كثيرة جدًا. اطلب رمزًا جديدًا. |
| `OTP_RESEND_COOLDOWN` | 429 | Veuillez patienter {seconds} secondes avant de demander un nouveau code. | يرجى الانتظار {seconds} ثانية قبل طلب رمز جديد. |
| `OTP_PURPOSE_NOT_ALLOWED` | 400 | Cette opération n'est pas autorisée pour ce code. | هذه العملية غير مسموح بها لهذا الرمز. |
| `MFA_REQUIRED` | 401 | La vérification en deux étapes est requise. | التحقق بخطوتين مطلوب. |
| `MFA_INVALID_CODE` | 401 | Code de vérification invalide. | رمز التحقق غير صالح. |
| `MFA_TOKEN_INVALID` | 401 | Session de vérification invalide ou expirée. Reconnectez-vous. | جلسة التحقق غير صالحة أو منتهية. أعد تسجيل الدخول. |
| `MFA_ALREADY_ENABLED` | 409 | La vérification en deux étapes est déjà activée. | التحقق بخطوتين مفعّل مسبقًا. |
| `MFA_NOT_ENABLED` | 400 | La vérification en deux étapes n'est pas activée. | التحقق بخطوتين غير مفعّل. |
| `MFA_SETUP_NOT_STARTED` | 400 | Commencez d'abord la configuration de la vérification en deux étapes. | ابدأ أولًا إعداد التحقق بخطوتين. |
| `MFA_MANDATORY_FOR_ROLE` | 403 | La vérification en deux étapes est obligatoire pour ce rôle. | التحقق بخطوتين إلزامي لهذا الدور. |
| `MFA_NOT_AVAILABLE_FOR_ROLE` | 403 | La vérification en deux étapes n'est pas disponible pour ce rôle. | التحقق بخطوتين غير متاح لهذا الدور. |
| `ACCOUNT_PENDING_VERIFICATION` | 403 | Votre compte est en attente de vérification. | حسابك في انتظار التحقق. |
| `ACCOUNT_SUSPENDED` | 403 | Votre compte est suspendu. Contactez le support. | تم تعليق حسابك. يرجى التواصل مع الدعم. |
| `ACCOUNT_DELETED` | 403 | Ce compte a été supprimé. | تم حذف هذا الحساب. |
| `ROLE_FORBIDDEN` | 403 | Votre rôle ne permet pas cette action. | دورك لا يسمح بهذا الإجراء. |
| `RESOURCE_FORBIDDEN` | 403 | Vous n'avez pas accès à cette ressource. | ليس لديك صلاحية الوصول إلى هذا المورد. |
| `ADMIN_REASON_REQUIRED` | 400 | Un motif est obligatoire pour cette action administrative. | يجب ذكر سبب لهذا الإجراء الإداري. |
| `USER_NOT_FOUND` | 404 | Utilisateur introuvable. | المستخدم غير موجود. |
| `IDENTIFIER_ALREADY_USED` | 409 | Cet e-mail ou ce numéro est déjà utilisé. | هذا البريد الإلكتروني أو الرقم مستخدم بالفعل. |
| `CANNOT_MODIFY_SELF` | 403 | Vous ne pouvez pas effectuer cette action sur votre propre compte. | لا يمكنك تنفيذ هذا الإجراء على حسابك الخاص. |
| `PHARMACY_NOT_FOUND` | 404 | Pharmacie introuvable. | الصيدلية غير موجودة. |
| `PHARMACY_NOT_VERIFIED` | 403 | La pharmacie n'est pas encore vérifiée. | لم يتم التحقق من الصيدلية بعد. |
| `PHARMACY_ACCESS_DENIED` | 403 | Vous ne faites pas partie de cette pharmacie ou votre rôle ne le permet pas. | أنت لست عضوًا في هذه الصيدلية أو أن دورك لا يسمح بذلك. |
| `PHARMACY_AUTHORIZATION_NUMBER_TAKEN` | 409 | Ce numéro d'agrément est déjà enregistré. | رقم الاعتماد هذا مسجّل مسبقًا. |
| `INVITATION_INVALID` | 400 | Invitation invalide. | الدعوة غير صالحة. |
| `INVITATION_EXPIRED` | 410 | Cette invitation a expiré. | انتهت صلاحية هذه الدعوة. |
| `DEVICE_NOT_FOUND` | 404 | Appareil introuvable. | الجهاز غير موجود. |
| `CONSENT_NOT_FOUND` | 404 | Consentement introuvable. | الموافقة غير موجودة. |
| `CONSENT_REQUIRED_NOT_REVOCABLE` | 400 | Ce consentement est nécessaire au service. Pour le retirer, demandez la suppression du compte. | هذه الموافقة ضرورية للخدمة. لسحبها، اطلب حذف الحساب. |
| `GEO_INVALID_COMMUNE` | 400 | La commune ne correspond pas à la wilaya. | البلدية لا تنتمي إلى هذه الولاية. |
| `FILE_REQUIRED` | 400 | Aucun fichier reçu. | لم يتم استلام أي ملف. |
| `FILE_TOO_MANY` | 400 | Trop de fichiers dans une seule requête. | عدد الملفات كبير جدًا في طلب واحد. |
| `FILE_TOO_LARGE` | 413 | Le fichier dépasse la taille maximale autorisée ({max} Mo). | يتجاوز الملف الحجم الأقصى المسموح به ({max} ميغابايت). |
| `FILE_TYPE_NOT_ALLOWED` | 415 | Type de fichier non autorisé. Formats acceptés : JPEG, PNG, PDF. | نوع الملف غير مسموح به. الصيغ المقبولة: JPEG وPNG وPDF. |
| `FILE_INFECTED` | 422 | Le fichier a été rejeté par l'analyse de sécurité. | تم رفض الملف من طرف الفحص الأمني. |
| `FILE_NOT_FOUND` | 404 | Fichier introuvable. | الملف غير موجود. |
| `FILE_PURPOSE_NOT_ALLOWED` | 403 | Vous ne pouvez pas téléverser ce type de document. | لا يمكنك رفع هذا النوع من المستندات. |
| `FILE_URL_INVALID` | 403 | Lien de téléchargement invalide ou expiré. | رابط التنزيل غير صالح أو منتهي الصلاحية. |
| `FILE_IN_USE` | 409 | Ce fichier est déjà utilisé et ne peut pas être supprimé. | هذا الملف مستخدم بالفعل ولا يمكن حذفه. |
| `FILE_INVALID_FOR_USE` | 400 | Ce fichier ne peut pas être utilisé ici (type, propriétaire ou analyse en cours). | لا يمكن استخدام هذا الملف هنا (النوع أو المالك أو الفحص قيد التنفيذ). |
| `ADDRESS_NOT_FOUND` | 404 | Adresse introuvable. | العنوان غير موجود. |
| `DEPENDANT_NOT_FOUND` | 404 | Personne à charge introuvable. | الشخص المكفول غير موجود. |
| `DEPENDANT_RELATIONSHIP_NOT_ALLOWED` | 403 | Les demandes ne sont pas autorisées pour ce lien de parenté. | الطلبات غير مسموح بها لهذه صلة القرابة. |
| `DEPENDANT_NOT_VERIFIED` | 403 | Le lien avec cette personne doit d'abord être vérifié. | يجب التحقق أولًا من صلتك بهذا الشخص. |
| `REQUEST_NOT_FOUND` | 404 | Demande introuvable. | الطلب غير موجود. |
| `REQUEST_CONSENT_REQUIRED` | 400 | Vous devez accepter le partage de votre ordonnance avec les pharmacies. | يجب الموافقة على مشاركة وصفتك الطبية مع الصيدليات. |
| `REQUEST_CATEGORY_RESTRICTED` | 422 | Cette catégorie de médicaments ne peut pas être demandée en ligne. | لا يمكن طلب هذه الفئة من الأدوية عبر الإنترنت. |
| `REQUEST_DELIVERY_NOT_ALLOWED` | 422 | La livraison n'est pas disponible pour cette demande. Choisissez le retrait en pharmacie. | التوصيل غير متاح لهذا الطلب. اختر الاستلام من الصيدلية. |
| `REQUEST_NO_PHARMACY_MATCHED` | 422 | Aucune pharmacie disponible ne couvre cette adresse pour le moment. | لا توجد صيدلية متاحة تغطي هذا العنوان حاليًا. |
| `REQUEST_PHARMACY_NOT_ELIGIBLE` | 422 | Une des pharmacies choisies ne peut pas recevoir de demande. | إحدى الصيدليات المختارة لا يمكنها استقبال الطلبات. |
| `REQUEST_TOO_MANY_PHARMACIES` | 400 | Trop de pharmacies sélectionnées (maximum {max}). | عدد الصيدليات المختارة كبير جدًا (الحد الأقصى {max}). |
| `REQUEST_NOT_CANCELLABLE` | 409 | Cette demande ne peut plus être annulée. | لم يعد بالإمكان إلغاء هذا الطلب. |
| `REQUEST_NOT_EDITABLE` | 409 | Cette demande ne peut plus être modifiée. | لم يعد بالإمكان تعديل هذا الطلب. |
| `REQUEST_ITEM_NOT_FOUND` | 404 | Article introuvable. | العنصر غير موجود. |
| `REQUEST_ITEM_LOCKED` | 409 | Cet article a été confirmé par le pharmacien et ne peut plus être modifié. | تم تأكيد هذا العنصر من طرف الصيدلي ولا يمكن تعديله. |
| `REQUEST_HAS_ORDER` | 409 | Une commande existe pour cette demande : annulez la commande. | يوجد طلب شراء مرتبط بهذا الطلب: قم بإلغاء طلب الشراء. |
| `CHIFA_DATA_REQUIRED` | 400 | La carte Chifa, le numéro d'assuré et le nom du titulaire sont requis. | بطاقة الشفاء ورقم المؤمن واسم صاحب البطاقة مطلوبة. |
| `PHARMACY_FIELD_LOCKED` | 403 | Ce champ légal ne peut plus être modifié après vérification. Contactez le support. | لا يمكن تعديل هذا الحقل القانوني بعد التحقق. تواصل مع الدعم. |
| `PHARMACY_DOCUMENT_NOT_FOUND` | 404 | Document introuvable. | المستند غير موجود. |
| `PHARMACY_DOCUMENT_LOCKED` | 409 | Ce document a déjà été examiné et ne peut plus être supprimé. | تمت مراجعة هذا المستند ولا يمكن حذفه. |
| `PHARMACY_DOCUMENTS_MISSING` | 400 | Documents obligatoires manquants : {types}. | مستندات إلزامية ناقصة: {types}. |
| `PHARMACY_VERIFICATION_NOT_ALLOWED` | 409 | La pharmacie ne peut pas être soumise à vérification dans son état actuel. | لا يمكن تقديم الصيدلية للتحقق في حالتها الحالية. |
| `STAFF_NOT_FOUND` | 404 | Membre du personnel introuvable. | الموظف غير موجود. |
| `STAFF_CANNOT_MODIFY_OWNER` | 403 | Le titulaire de la pharmacie ne peut pas être modifié ici. | لا يمكن تعديل مالك الصيدلية هنا. |
| `STAFF_LICENSE_REQUIRED` | 400 | Un numéro d'inscription de pharmacien est requis pour ce rôle. | رقم تسجيل الصيدلي مطلوب لهذا الدور. |
| `PAYOUT_ACCOUNT_NOT_FOUND` | 404 | Compte de versement introuvable. | حساب التحويل غير موجود. |
| `SERVICE_AREA_NOT_FOUND` | 404 | Zone desservie introuvable. | منطقة الخدمة غير موجودة. |
| `ON_DUTY_NOT_FOUND` | 404 | Période de garde introuvable. | فترة المناوبة غير موجودة. |
| `OPENING_HOURS_INVALID` | 400 | Horaires invalides : chaque jour doit être fermé, ouvert 24h/24 ou avoir des heures d'ouverture et de fermeture. | أوقات غير صالحة: يجب أن يكون كل يوم مغلقًا أو مفتوحًا 24/24 أو بأوقات فتح وغلق. |
| `MEDICINE_NOT_FOUND` | 404 | Médicament introuvable dans le catalogue. | الدواء غير موجود في الدليل. |
| `STOCK_NOT_FOUND` | 404 | Aucune ligne de stock pour ce médicament. | لا يوجد مخزون لهذا الدواء. |
| `STOCK_IMPORT_INVALID_FILE` | 400 | Fichier CSV invalide ou vide. | ملف CSV غير صالح أو فارغ. |
| `RECIPIENT_CLOSED` | 409 | Votre pharmacie ne peut plus agir sur cette demande. | لم يعد بإمكان صيدليتك التصرف في هذا الطلب. |
| `CLARIFICATION_NOT_ALLOWED` | 409 | Une question ne peut pas être posée dans l'état actuel de la demande. | لا يمكن طرح سؤال في الحالة الحالية للطلب. |
| `OFFER_NOT_FOUND` | 404 | Proposition introuvable. | العرض غير موجود. |
| `OFFER_ALREADY_EXISTS` | 409 | Votre pharmacie a déjà une proposition active pour cette demande. | لصيدليتك عرض نشط بالفعل لهذا الطلب. |
| `OFFER_NOT_EDITABLE` | 409 | Seules les propositions en brouillon peuvent être modifiées. | يمكن تعديل العروض المسودة فقط. |
| `OFFER_NOT_SENDABLE` | 422 | La proposition doit contenir au moins un article disponible. | يجب أن يحتوي العرض على عنصر متوفر واحد على الأقل. |
| `OFFER_NOT_WITHDRAWABLE` | 409 | Cette proposition ne peut plus être retirée. | لم يعد بالإمكان سحب هذا العرض. |
| `OFFER_ALTERNATIVE_REQUIRES_PHARMACIST` | 403 | Seul un pharmacien peut proposer une substitution. | يمكن للصيدلي فقط اقتراح بديل. |
| `OFFER_ITEM_RESTRICTED` | 422 | Cet article ne peut pas être proposé en ligne (catégorie restreinte). | لا يمكن عرض هذا العنصر عبر الإنترنت (فئة مقيدة). |
| `OFFER_ITEM_INVALID` | 400 | Un article de la proposition ne correspond pas à la demande. | أحد عناصر العرض لا يطابق الطلب. |
| `OFFER_EXPIRED` | 410 | Cette proposition a expiré. | انتهت صلاحية هذا العرض. |
| `OFFER_DELIVERY_NOT_AVAILABLE` | 422 | La livraison ne peut pas être proposée pour cette demande. | لا يمكن اقتراح التوصيل لهذا الطلب. |
| `DELIVERY_ZONE_NOT_COVERED` | 422 | Aucune zone de livraison ne couvre cette adresse. | لا توجد منطقة توصيل تغطي هذا العنوان. |
| `OFFER_ITEM_APPROVAL_NOT_PENDING` | 409 | Aucune approbation n'est attendue pour cet article. | لا توجد موافقة مطلوبة لهذا العنصر. |
| `COMPLAINT_NOT_FOUND` | 404 | Réclamation introuvable. | الشكوى غير موجودة. |
| `COMPLAINT_CLOSED` | 409 | Cette réclamation est clôturée. | هذه الشكوى مغلقة. |
