export const messages = {
  en: {
    // ================= QUESTIONS =================
    question: {
      CREATED: 'Question submitted successfully and is pending review',
      LIST: 'Questions fetched successfully',
      DETAIL: 'Question details',
      NOT_FOUND: 'Question not found',
      ANSWERED: 'Answer submitted successfully',
      ALREADY_ANSWERED_BY_YOU: 'You have already answered this question',
      INVALID_ID: 'Invalid question ID',
      FORBIDDEN: 'You are not allowed to perform this action',
      APPROVED: 'Question approved successfully',
      REJECTED: 'Question rejected successfully',
      STATS: 'Question statistics fetched successfully',
      ALREADY_MODERATED: 'This question has already been moderated',
      REJECTION_REASON_REQUIRED: 'A rejection reason is required',
      NOT_YET_APPROVED:
        'This question is pending approval and cannot be answered yet',
      NOT_AVAILABLE: 'This question is not available',
      ONLY_PROVIDERS_CAN_ANSWER:
        'Only doctors, hospitals, and centers can answer questions',
      DELETED: 'Question deleted successfully',
    },

    // ================= SPECIALIZATIONS =================
    specialization: {
      NOT_FOUND: 'Specialization not found',
      LIST: 'Specializations fetched successfully',
      INVALID_ID: 'Invalid specialization ID',
    },

    // ================= USERS / AUTH =================
    user: {
      NOT_FOUND: 'User not found',
      UNAUTHORIZED: 'Unauthorized access',
      INVALID_ID: 'Invalid user ID',
      INVALID_ROLE: 'Invalid user role',
    },

    // ================= AUTHORS =================
    author: {
      NOT_FOUND: 'Author profile not found',
    },

    // ================= DOCTORS =================
    doctor: {
      FETCHED: 'Doctor profile fetched successfully',
      UPDATED: 'Doctor profile updated successfully',
      DELETED: 'Doctor deleted successfully',
      NOT_FOUND: 'Doctor not found',
      INVALID_ID: 'Invalid doctor ID',
      TOP_SEARCHED: 'Top searched doctors',
    },

    // ================= HOSPITALS =================
    hospital: {
      NOT_FOUND: 'Hospital not found',
      INVALID_ID: 'Invalid hospital ID',
    },

    // ================= CENTERS =================
    center: {
      NOT_FOUND: 'Center not found',
      INVALID_ID: 'Invalid center ID',
    },

    // ================= BOOKINGS =================
    booking: {
      NEXT_FOR_USER: 'Next upcoming booking fetched successfully',
      NEXT_FOR_DOCTOR: 'Next upcoming booking fetched successfully',
      ALL_FOR_USER: 'Bookings fetched successfully',
      NOT_FOUND_USER: 'No upcoming booking found',
      NOT_FOUND_DOCTOR: 'No upcoming booking found',
      INVALID_STATUS: 'Invalid booking status',
      DOCTOR_PATIENTS: 'Doctor patients fetched successfully',
      MY_APPOINTMENTS: 'Appointments fetched successfully',
    },

    // ================= POSTS =================
    post: {
      CREATED: 'Post created successfully and is pending review',
      LIST: 'Posts fetched successfully',
      FOUND: 'Post fetched successfully',
      UPDATED: 'Post updated successfully',
      DELETED: 'Post deleted successfully',
      NOT_FOUND: 'Post not found',
      FORBIDDEN: 'You are not allowed to perform this action',
      INVALID_CONTENT: 'Post must contain text or at least one image',
      FETCHED: 'Posts fetched successfully',
      INVALID_ID: 'Invalid post ID',
      INVALID_STATUS: 'Invalid post status',
      LIKE_UPDATED: 'Like updated successfully',
      ALREADY_REVIEWED: 'This post has already been reviewed',
      REJECTION_REASON_REQUIRED:
        'A rejection reason is required when rejecting a post',
      STATS: 'Post statistics fetched successfully',
    },

    // ================= REQUESTS (Legal Advice / Medical Equipment) =================
    request: {
      CREATED: 'Request submitted successfully',
      FETCHED: 'Requests fetched successfully',
      UPDATED: 'Request updated successfully',
      DELETED: 'Request deleted successfully',
      NOT_FOUND: 'Request not found',
      FORBIDDEN: 'You are not allowed to access this request',
      INVALID_ID: 'Invalid request ID',
      INVALID_STATUS: 'Invalid request status',
      STATUS_REQUIRED: 'Status is required',
      CONTACT_NOTES_REQUIRED: 'Contact notes are required',
      ADMIN_ID_REQUIRED: 'Admin ID is required',
      EMPTY_REQUEST_IDS: 'At least one request ID is required',
      STATISTICS: 'Request statistics fetched successfully',
      ALREADY_CANCELLED: 'This request has already been cancelled',
      ALREADY_COMPLETED: 'This request has already been completed',
    },

    // ================= ADMIN =================
    admin: {
      DASHBOARD: 'Dashboard loaded successfully',
      REQUESTS_FETCHED: 'Requests fetched successfully',
      REQUEST_DETAILS: 'Request details fetched successfully',
      MY_QUEUE: 'Your queue fetched successfully',
      STATUS_UPDATED: 'Request status updated successfully',
      MARKED_CONTACTED: 'Request marked as contacted successfully',
      MOVED_TO_REVIEW: 'Request moved to review successfully',
      REQUEST_COMPLETED: 'Request marked as completed successfully',
      REQUEST_CANCELLED: 'Request cancelled successfully',
      BULK_UPDATE_SUCCESS: 'Requests updated successfully',
      REQUEST_REASSIGNED: 'Request reassigned successfully',
      STATISTICS: 'Statistics fetched successfully',
    },

    // ================= DASHBOARD =================
    dashboard: {
      STATS: 'Dashboard statistics fetched successfully',
      CALENDAR: 'Calendar fetched successfully',
      APPOINTMENTS: 'Appointments fetched successfully',
      REVENUE: 'Revenue data fetched successfully',
      PATIENTS: 'Recent patients fetched successfully',
      FULL: 'Dashboard loaded successfully',
    },

    // ================= ENTITY PROFILE =================
    entity: {
      PROFILE_FETCHED: 'Profile fetched successfully',
      GALLERY_FETCHED: 'Gallery fetched successfully',
      GALLERY_UPDATED: 'Gallery updated successfully',
      GALLERY_CLEARED: 'Gallery cleared successfully',
      NOT_FOUND: 'Entity not found',
    },

    // ================= COMMON =================
    common: {
      SUCCESS: 'Success',
      ERROR: 'Something went wrong, please try again',
      VALIDATION_ERROR: 'Validation failed',
      INVALID_ID: 'Invalid ID format',
    },
  },

  // =====================================================================

  ar: {
    // ================= QUESTIONS =================
    question: {
      CREATED: 'تم إرسال السؤال بنجاح وهو قيد المراجعة',
      LIST: 'تم جلب الأسئلة بنجاح',
      DETAIL: 'تفاصيل السؤال',
      NOT_FOUND: 'السؤال غير موجود',
      ANSWERED: 'تم إرسال الإجابة بنجاح',
      ALREADY_ANSWERED_BY_YOU: 'لقد أجبت على هذا السؤال مسبقاً',
      INVALID_ID: 'معرّف السؤال غير صالح',
      FORBIDDEN: 'غير مصرح لك بتنفيذ هذا الإجراء',
      APPROVED: 'تمت الموافقة على السؤال بنجاح',
      REJECTED: 'تم رفض السؤال بنجاح',
      STATS: 'تم جلب إحصائيات الأسئلة بنجاح',
      ALREADY_MODERATED: 'تمت مراجعة هذا السؤال مسبقاً',
      REJECTION_REASON_REQUIRED: 'يجب تقديم سبب الرفض',
      NOT_YET_APPROVED: 'هذا السؤال قيد المراجعة ولا يمكن الإجابة عليه بعد',
      NOT_AVAILABLE: 'هذا السؤال غير متاح',
      ONLY_PROVIDERS_CAN_ANSWER:
        'يمكن للأطباء والمستشفيات والمراكز فقط الإجابة على الأسئلة',
      DELETED: 'تم حذف السؤال بنجاح',
    },

    // ================= SPECIALIZATIONS =================
    specialization: {
      NOT_FOUND: 'التخصص غير موجود',
      LIST: 'تم جلب التخصصات بنجاح',
      INVALID_ID: 'معرّف التخصص غير صالح',
    },

    // ================= USERS / AUTH =================
    user: {
      NOT_FOUND: 'المستخدم غير موجود',
      UNAUTHORIZED: 'دخول غير مصرح به',
      INVALID_ID: 'معرّف المستخدم غير صالح',
      INVALID_ROLE: 'صلاحية المستخدم غير صالحة',
    },

    // ================= AUTHORS =================
    author: {
      NOT_FOUND: 'الملف الشخصي للمؤلف غير موجود',
    },

    // ================= DOCTORS =================
    doctor: {
      FETCHED: 'تم جلب الملف الشخصي للطبيب بنجاح',
      UPDATED: 'تم تحديث الملف الشخصي للطبيب بنجاح',
      DELETED: 'تم حذف الطبيب بنجاح',
      NOT_FOUND: 'الطبيب غير موجود',
      INVALID_ID: 'معرّف الطبيب غير صالح',
      TOP_SEARCHED: 'الأطباء الأكثر بحثاً',
    },

    // ================= HOSPITALS =================
    hospital: {
      NOT_FOUND: 'المستشفى غير موجود',
      INVALID_ID: 'معرّف المستشفى غير صالح',
    },

    // ================= CENTERS =================
    center: {
      NOT_FOUND: 'المركز غير موجود',
      INVALID_ID: 'معرّف المركز غير صالح',
    },

    // ================= BOOKINGS =================
    booking: {
      NEXT_FOR_USER: 'تم جلب أقرب حجز قادم بنجاح',
      NEXT_FOR_DOCTOR: 'تم جلب أقرب حجز قادم بنجاح',
      ALL_FOR_USER: 'تم جلب الحجوزات بنجاح',
      NOT_FOUND_USER: 'لا يوجد حجز قادم',
      NOT_FOUND_DOCTOR: 'لا يوجد حجز قادم',
      INVALID_STATUS: 'حالة الحجز غير صالحة',
      DOCTOR_PATIENTS: 'تم جلب قائمة مرضى الطبيب بنجاح',
      MY_APPOINTMENTS: 'تم جلب قائمة المواعيد بنجاح',
    },

    // ================= POSTS =================
    post: {
      CREATED: 'تم إنشاء المنشور بنجاح وهو قيد المراجعة',
      LIST: 'تم جلب المنشورات بنجاح',
      FOUND: 'تم جلب المنشور بنجاح',
      UPDATED: 'تم تحديث المنشور بنجاح',
      DELETED: 'تم حذف المنشور بنجاح',
      NOT_FOUND: 'المنشور غير موجود',
      FORBIDDEN: 'غير مصرح لك بتنفيذ هذا الإجراء',
      INVALID_CONTENT: 'يجب أن يحتوي المنشور على نص أو صورة واحدة على الأقل',
      FETCHED: 'تم جلب المنشورات بنجاح',
      INVALID_ID: 'معرّف المنشور غير صالح',
      INVALID_STATUS: 'حالة المنشور غير صالحة',
      LIKE_UPDATED: 'تم تحديث الإعجاب بنجاح',
      ALREADY_REVIEWED: 'تمت مراجعة هذا المنشور مسبقاً',
      REJECTION_REASON_REQUIRED: 'يجب تقديم سبب الرفض عند رفض المنشور',
      STATS: 'تم جلب إحصائيات المنشورات بنجاح',
    },

    // ================= REQUESTS (Legal Advice / Medical Equipment) =================
    request: {
      CREATED: 'تم إرسال الطلب بنجاح',
      FETCHED: 'تم جلب الطلبات بنجاح',
      UPDATED: 'تم تحديث الطلب بنجاح',
      DELETED: 'تم حذف الطلب بنجاح',
      NOT_FOUND: 'الطلب غير موجود',
      FORBIDDEN: 'غير مصرح لك بالوصول إلى هذا الطلب',
      INVALID_ID: 'معرّف الطلب غير صالح',
      INVALID_STATUS: 'حالة الطلب غير صالحة',
      STATUS_REQUIRED: 'الحالة مطلوبة',
      CONTACT_NOTES_REQUIRED: 'ملاحظات التواصل مطلوبة',
      ADMIN_ID_REQUIRED: 'معرّف المشرف مطلوب',
      EMPTY_REQUEST_IDS: 'يجب تحديد طلب واحد على الأقل',
      STATISTICS: 'تم جلب إحصائيات الطلبات بنجاح',
      ALREADY_CANCELLED: 'تم إلغاء هذا الطلب مسبقاً',
      ALREADY_COMPLETED: 'تم إكمال هذا الطلب مسبقاً',
    },

    // ================= ADMIN =================
    admin: {
      DASHBOARD: 'تم تحميل لوحة التحكم بنجاح',
      REQUESTS_FETCHED: 'تم جلب الطلبات بنجاح',
      REQUEST_DETAILS: 'تم جلب تفاصيل الطلب بنجاح',
      MY_QUEUE: 'تم جلب قائمة انتظارك بنجاح',
      STATUS_UPDATED: 'تم تحديث حالة الطلب بنجاح',
      MARKED_CONTACTED: 'تم تحديد الطلب كـ "تم التواصل" بنجاح',
      MOVED_TO_REVIEW: 'تم نقل الطلب إلى المراجعة بنجاح',
      REQUEST_COMPLETED: 'تم تحديد الطلب كـ "مكتمل" بنجاح',
      REQUEST_CANCELLED: 'تم إلغاء الطلب بنجاح',
      BULK_UPDATE_SUCCESS: 'تم تحديث الطلبات بنجاح',
      REQUEST_REASSIGNED: 'تم إعادة تعيين الطلب بنجاح',
      STATISTICS: 'تم جلب الإحصائيات بنجاح',
    },

    // ================= DASHBOARD =================
    dashboard: {
      STATS: 'تم جلب إحصائيات لوحة التحكم بنجاح',
      CALENDAR: 'تم جلب التقويم بنجاح',
      APPOINTMENTS: 'تم جلب المواعيد بنجاح',
      REVENUE: 'تم جلب بيانات الإيرادات بنجاح',
      PATIENTS: 'تم جلب آخر المرضى بنجاح',
      FULL: 'تم تحميل لوحة التحكم بنجاح',
    },

    // ================= ENTITY PROFILE =================
    entity: {
      PROFILE_FETCHED: 'تم جلب الملف الشخصي بنجاح',
      GALLERY_FETCHED: 'تم جلب معرض الصور بنجاح',
      GALLERY_UPDATED: 'تم تحديث معرض الصور بنجاح',
      GALLERY_CLEARED: 'تم مسح معرض الصور بنجاح',
      NOT_FOUND: 'الكيان غير موجود',
    },

    // ================= COMMON =================
    common: {
      SUCCESS: 'تمت العملية بنجاح',
      ERROR: 'حدث خطأ ما، يرجى المحاولة مجدداً',
      VALIDATION_ERROR: 'فشل التحقق من البيانات',
      INVALID_ID: 'صيغة المعرّف غير صالحة',
    },
  },
};
