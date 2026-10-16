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
| `CONVERSATION_NOT_FOUND` | 404 | Conversation introuvable. | المحادثة غير موجودة. |
| `CONVERSATION_CLOSED` | 409 | Cette conversation est clôturée. | هذه المحادثة مغلقة. |
| `MESSAGE_EMPTY` | 400 | Le message est vide. | الرسالة فارغة. |
| `MESSAGE_TOO_LONG` | 400 | Le message dépasse {max} caractères. | تتجاوز الرسالة {max} حرفًا. |
| `MESSAGE_RATE_LIMITED` | 429 | Vous envoyez trop de messages. Patientez un instant. | أنت ترسل رسائل كثيرة جدًا. انتظر قليلًا. |
| `MESSAGE_CONTAINS_PHONE` | 422 | Pour votre sécurité, ne partagez pas de numéro de téléphone dans la messagerie. | حفاظًا على سلامتك، لا تشارك أرقام الهاتف في المراسلة. |
| `MESSAGE_BLOCKED_CONTENT` | 422 | Ce message contient des termes non autorisés. | تحتوي هذه الرسالة على كلمات غير مسموح بها. |
| `MESSAGE_TYPE_NOT_ALLOWED` | 403 | Ce type de message n'est pas autorisé pour vous. | نوع الرسالة هذا غير مسموح لك. |
| `NOTIFICATION_NOT_FOUND` | 404 | Notification introuvable. | الإشعار غير موجود. |
| `ORDER_NOT_FOUND` | 404 | Commande introuvable. | طلب الشراء غير موجود. |
| `ORDER_INVALID_TRANSITION` | 409 | Cette action n'est pas possible dans l'état actuel de la commande. | هذا الإجراء غير ممكن في الحالة الحالية للطلب. |
| `ORDER_ACTION_FORBIDDEN` | 403 | Vous ne pouvez pas effectuer cette action sur cette commande. | لا يمكنك تنفيذ هذا الإجراء على هذا الطلب. |
| `ORDER_VERSION_CONFLICT` | 409 | La commande vient d'être modifiée. Rechargez et réessayez. | تم تعديل الطلب للتو. أعد التحميل وحاول مجددًا. |
| `ORDER_REASON_REQUIRED` | 400 | Un motif est requis pour cette action. | يجب ذكر سبب لهذا الإجراء. |
| `ORDER_NOT_CANCELLABLE` | 409 | Cette commande ne peut plus être annulée. | لم يعد بالإمكان إلغاء هذا الطلب. |
| `ORDER_CANCEL_REQUIRES_APPROVAL` | 409 | La commande est en préparation : l'annulation doit être acceptée par la pharmacie ou le support. | الطلب قيد التحضير: يجب أن توافق الصيدلية أو الدعم على الإلغاء. |
| `ORDER_ALTERNATIVES_PENDING` | 409 | Acceptez ou refusez chaque substitution proposée avant de valider. | وافق على كل بديل مقترح أو ارفضه قبل التأكيد. |
| `ORDER_NOTHING_TO_ORDER` | 422 | Aucun article disponible dans cette proposition. | لا يوجد أي عنصر متوفر في هذا العرض. |
| `ORDER_OFFER_NOT_AVAILABLE` | 409 | Cette proposition n'est plus disponible. | لم يعد هذا العرض متاحًا. |
| `ORDER_ITEM_OUT_OF_STOCK` | 409 | Un article n'est plus en stock. Contactez la pharmacie. | أحد العناصر لم يعد متوفرًا. تواصل مع الصيدلية. |
| `ORDER_DELIVERY_NOT_AVAILABLE` | 422 | La livraison n'est pas disponible pour cette commande. | التوصيل غير متاح لهذا الطلب. |
| `ORDER_VALIDATION_CONFIRM_REQUIRED` | 400 | La validation pharmaceutique exige une confirmation explicite. | تتطلب المصادقة الصيدلانية تأكيدًا صريحًا. |
| `ORDER_COLLECTION_CODE_INVALID` | 400 | Code de retrait incorrect. | رمز الاستلام غير صحيح. |
| `ORDER_COLLECTION_CODE_LOCKED` | 429 | Trop de codes incorrects. Le patient doit générer un nouveau code. | رموز خاطئة كثيرة. يجب على المريض إنشاء رمز جديد. |
| `IDEMPOTENCY_KEY_INVALID` | 400 | En-tête Idempotency-Key invalide (8 à 128 caractères). | ترويسة Idempotency-Key غير صالحة (من 8 إلى 128 حرفًا). |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Cette clé d'idempotence a déjà été utilisée pour une autre requête. | تم استخدام مفتاح عدم التكرار هذا لطلب آخر. |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Une requête identique est déjà en cours de traitement. | طلب مماثل قيد المعالجة بالفعل. |
| `PAYMENT_NOT_FOUND` | 404 | Paiement introuvable. | الدفع غير موجود. |
| `PAYMENT_NOT_ALLOWED` | 409 | Cette commande ne peut pas être payée dans son état actuel. | لا يمكن دفع هذا الطلب في حالته الحالية. |
| `PAYMENT_DEADLINE_PASSED` | 409 | Le délai de paiement est dépassé. | انتهت مهلة الدفع. |
| `PAYMENT_ALREADY_IN_PROGRESS` | 409 | Un paiement est déjà en cours pour cette commande. | هناك عملية دفع جارية بالفعل لهذا الطلب. |
| `PAYMENT_NOT_ALLOWED_FOR_CATEGORY` | 403 | Le paiement en ligne n'est pas autorisé pour certains produits de cette commande. | الدفع الإلكتروني غير مسموح لبعض منتجات هذا الطلب. |
| `PAYMENT_PROVIDER_ERROR` | 502 | Le service de paiement est indisponible. Réessayez plus tard. | خدمة الدفع غير متاحة. حاول لاحقًا. |
| `PAYMENT_PROVIDER_UNKNOWN` | 404 | Prestataire de paiement inconnu. | مزود الدفع غير معروف. |
| `PAYMENT_WEBHOOK_INVALID_SIGNATURE` | 401 | Signature de notification invalide. | توقيع الإشعار غير صالح. |
| `MOCK_PROVIDER_DISABLED` | 404 | Le prestataire de test est désactivé. | مزود الاختبار معطّل. |
| `REFUND_NOT_FOUND` | 404 | Remboursement introuvable. | الاسترداد غير موجود. |
| `REFUND_NOT_ALLOWED` | 409 | Aucun remboursement possible pour cette commande. | لا يمكن الاسترداد لهذا الطلب. |
| `REFUND_AMOUNT_INVALID` | 400 | Montant de remboursement invalide. | مبلغ الاسترداد غير صالح. |
| `RECEIPT_NOT_FOUND` | 404 | Reçu introuvable. | الإيصال غير موجود. |
| `SETTLEMENT_INVALID_STATE` | 409 | Action impossible dans l'état actuel du règlement. | لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للتسوية. |
| `RECONCILIATION_ISSUE_NOT_FOUND` | 404 | Anomalie de rapprochement introuvable ou déjà résolue. | مشكلة المطابقة غير موجودة أو تم حلها. |
| `PERMISSION_DENIED` | 403 | Vous n'avez pas la permission d'effectuer cette action. | ليست لديك صلاحية تنفيذ هذا الإجراء. |
| `DELIVERY_NOT_FOUND` | 404 | Livraison introuvable. | التوصيل غير موجود. |
| `DELIVERY_ALREADY_TAKEN` | 409 | Cette course a déjà été prise par un autre livreur. | تم أخذ هذه التوصيلة من طرف سائق آخر. |
| `DELIVERY_INVALID_TRANSITION` | 409 | Action impossible dans l'état actuel de la livraison. | لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للتوصيل. |
| `DELIVERY_VERSION_CONFLICT` | 409 | La livraison a été modifiée entre-temps. Rechargez et réessayez. | تم تعديل التوصيل في الأثناء. أعد التحميل وحاول مجددًا. |
| `DELIVERY_RELEASE_LIMIT_REACHED` | 429 | Vous avez atteint le nombre maximal de courses rendues aujourd'hui. | لقد بلغت الحد الأقصى للتوصيلات المُعادة اليوم. |
| `DELIVERY_CODE_INVALID` | 400 | Code incorrect. | الرمز غير صحيح. |
| `DELIVERY_CODE_LOCKED` | 429 | Trop de tentatives : un nouveau code doit être généré. | محاولات كثيرة: يجب إنشاء رمز جديد. |
| `DELIVERY_PROOF_REQUIRED` | 400 | Une seule preuve de livraison valide est requise (code, signature ou photo sans visage). | يلزم دليل تسليم واحد صالح (رمز أو توقيع أو صورة بدون وجه). |
| `DELIVERY_LOCATION_THROTTLED` | 429 | Position mise à jour trop souvent. | تحديث الموقع متكرر جدًا. |
| `DRIVER_PROFILE_NOT_FOUND` | 404 | Profil livreur introuvable. | ملف السائق غير موجود. |
| `DRIVER_NOT_VERIFIED` | 403 | Votre compte livreur doit être vérifié pour accéder aux courses. | يجب التحقق من حساب السائق للوصول إلى التوصيلات. |
| `DRIVER_NOT_AVAILABLE` | 409 | Passez en ligne pour accepter une course. | قم بتفعيل التوفر لقبول توصيلة. |
| `DELIVERY_COMPANY_NOT_FOUND` | 404 | Société de livraison introuvable. | شركة التوصيل غير موجودة. |
| `DELIVERY_COMPANY_NOT_VERIFIED` | 403 | La société de livraison doit être vérifiée. | يجب التحقق من شركة التوصيل. |
| `DELIVERY_INVITATION_INVALID` | 400 | Invitation invalide ou expirée. | الدعوة غير صالحة أو منتهية. |
| `DELIVERY_DRIVER_BUSY` | 409 | Le livreur a une course en cours. | لدى السائق توصيلة جارية. |
| `DELIVERY_DRIVER_NOT_FOUND` | 404 | Livreur introuvable. | السائق غير موجود. |
| `ADMIN_MFA_REQUIRED` | 403 | L'authentification à deux facteurs est obligatoire pour les administrateurs. | المصادقة الثنائية إلزامية للمسؤولين. |
| `ADMIN_ROLE_TARGET_INVALID` | 400 | Les rôles d'administration ne s'attribuent qu'à un compte ADMIN. | لا تُمنح أدوار الإدارة إلا لحساب مسؤول. |
| `SENSITIVE_ACCESS_GRANT_REQUIRED` | 403 | Accès aux données sensibles : ouvrez d'abord un accès justifié et limité dans le temps. | الوصول إلى البيانات الحساسة: افتح أولاً وصولاً مبرراً ومحدوداً زمنياً. |
| `VERIFICATION_INVALID_STATE` | 409 | Ce dossier n'est pas en attente de vérification. | هذا الملف ليس في انتظار التحقق. |
| `VERIFICATION_REASON_REQUIRED` | 400 | Un motif est obligatoire. | السبب إلزامي. |
| `COMPLAINT_ASSIGNEE_INVALID` | 400 | La réclamation ne peut être assignée qu'à un administrateur actif. | لا يمكن إسناد الشكوى إلا لمسؤول نشط. |
| `COMPLAINT_OUTCOME_INVALID` | 400 | Cette issue n'est pas applicable à cette réclamation. | هذه النتيجة غير قابلة للتطبيق على هذه الشكوى. |
| `DELIVERY_ZONE_EXISTS` | 409 | Une zone active existe déjà pour ce périmètre. | توجد منطقة نشطة لهذا النطاق بالفعل. |
| `LEGAL_REVIEW_NOTE_REQUIRED` | 400 | Une note de revue juridique est obligatoire pour activer cette règle. | ملاحظة المراجعة القانونية إلزامية لتفعيل هذه القاعدة. |
| `ELIGIBILITY_LEGAL_BASIS_REQUIRED` | 400 | Une référence de base légale est obligatoire pour activer cette politique. | مرجع الأساس القانوني إلزامي لتفعيل هذه السياسة. |
| `ELIGIBILITY_RULE_FORBIDDEN` | 400 | Cette catégorie exige toujours la validation d'un pharmacien. | تتطلب هذه الفئة دائماً تحقق الصيدلي. |
| `MEDICINE_CODE_TAKEN` | 409 | Ce code réglementaire est déjà utilisé. | هذا الرمز التنظيمي مستعمل بالفعل. |
| `CATALOG_IMPORT_INVALID_FILE` | 400 | Fichier CSV invalide. | ملف CSV غير صالح. |
| `SETTING_NOT_FOUND` | 404 | Paramètre inconnu. | إعداد غير معروف. |
| `SETTING_VALUE_INVALID` | 400 | Valeur de paramètre invalide. | قيمة الإعداد غير صالحة. |
| `NOTIFICATION_TEMPLATE_NOT_FOUND` | 404 | Modèle de notification introuvable. | نموذج الإشعار غير موجود. |
| `NOTIFICATION_TEMPLATE_INVALID` | 400 | Le modèle utilise des variables non autorisées. | يستخدم النموذج متغيرات غير مسموح بها. |
