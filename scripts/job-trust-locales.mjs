// Apply v0.28 interface translations: Urdu, Arabic, Spanish, French, German.
import { readFileSync, writeFileSync } from 'node:fs';
const rows = [
 ['Job Trust Score','نوکری کے اعتماد کا اسکور','مؤشر موثوقية الوظيفة','Puntuación de confianza del empleo','Indice de confiance de l’offre','Vertrauenswert der Stelle'],
 ['Evidence, not a guarantee of legitimacy. An unavailable page is not proof of a scam.','یہ شواہد ہیں، قانونی حیثیت کی ضمانت نہیں۔ غیر دستیاب صفحہ دھوکے کا ثبوت نہیں۔','أدلة وليست ضماناً للمصداقية. عدم توفر الصفحة ليس دليلاً على الاحتيال.','Evidencia, no una garantía de legitimidad. Una página inaccesible no demuestra una estafa.','Des indices, pas une garantie de légitimité. Une page inaccessible ne prouve pas une fraude.','Hinweise, keine Garantie der Seriosität. Eine nicht erreichbare Seite ist kein Betrugsbeweis.'],
 ['Employer careers page (optional)','آجر کا کیریئر صفحہ (اختیاری)','صفحة وظائف صاحب العمل (اختيارية)','Página de empleo del empleador (opcional)','Page carrières de l’employeur (facultatif)','Karriereseite des Arbeitgebers (optional)'],
 ['Enter a careers page you independently know belongs to the employer. We check for a link to this exact vacancy.','وہ کیریئر صفحہ درج کریں جس کے بارے میں آپ آزادانہ طور پر جانتے ہیں کہ وہ آجر کا ہے۔ ہم اسی آسامی کا لنک تلاش کرتے ہیں۔','أدخل صفحة وظائف تعلم بشكل مستقل أنها تخص صاحب العمل. نتحقق من رابط لهذه الوظيفة بالتحديد.','Introduce una página de empleo que sepas de forma independiente que pertenece al empleador. Buscamos un enlace a esta vacante concreta.','Saisissez une page carrières dont vous savez indépendamment qu’elle appartient à l’employeur. Nous cherchons un lien vers cette offre précise.','Geben Sie eine Karriereseite ein, die nach Ihrem eigenen Wissen zum Arbeitgeber gehört. Wir suchen einen Link zu genau dieser Stelle.'],
 ['Check job and employer','نوکری اور آجر کی جانچ کریں','تحقق من الوظيفة وصاحب العمل','Comprobar empleo y empleador','Vérifier l’offre et l’employeur','Stelle und Arbeitgeber prüfen'],
 ['Enter a valid HTTPS careers-page URL.','درست HTTPS کیریئر صفحے کا URL درج کریں۔','أدخل عنوان HTTPS صالحاً لصفحة الوظائف.','Introduce una URL HTTPS válida de la página de empleo.','Saisissez une URL HTTPS valide de la page carrières.','Geben Sie eine gültige HTTPS-URL der Karriereseite ein.'],
 ['Trust check unavailable. Try again later.','اعتماد کی جانچ دستیاب نہیں۔ بعد میں دوبارہ کوشش کریں۔','التحقق غير متاح. حاول لاحقاً.','Comprobación no disponible. Inténtalo más tarde.','Vérification indisponible. Réessayez plus tard.','Vertrauensprüfung nicht verfügbar. Versuchen Sie es später.'],
 ['Corroborated listing','تائیدی شواہد والی آسامی','إعلان مدعوم بأدلة','Oferta corroborada','Offre corroborée','Bestätigende Hinweise zur Stelle'],
 ['Review before applying','درخواست سے پہلے جائزہ لیں','راجع قبل التقديم','Revisar antes de solicitar','À examiner avant de postuler','Vor der Bewerbung prüfen'],
 ['Listing appears closed','آسامی بند معلوم ہوتی ہے','يبدو الإعلان مغلقاً','La oferta parece cerrada','L’offre semble clôturée','Stelle scheint geschlossen'],
 ['Limited evidence','محدود شواہد','أدلة محدودة','Evidencia limitada','Indices limités','Begrenzte Hinweise'],
 ['Listing domain','آسامی کا ڈومین','نطاق الإعلان','Dominio de la oferta','Domaine de l’offre','Domain der Stelle'],
 ['Secure link','محفوظ لنک','رابط آمن','Enlace seguro','Lien sécurisé','Sicherer Link'],
 ['Listing check','آسامی کی جانچ','التحقق من الإعلان','Comprobación de la oferta','Vérification de l’offre','Stellenprüfung'],
 ['Readable matching page','مطابق قابل مطالعہ صفحہ','صفحة مطابقة قابلة للقراءة','Página coincidente legible','Page correspondante lisible','Lesbare passende Seite'],
 ['Could not verify','تصدیق نہیں ہو سکی','تعذر التحقق','No se pudo verificar','Impossible de vérifier','Nicht verifizierbar'],
 ['Job title found','عہدہ مل گیا','تم العثور على المسمى الوظيفي','Título del empleo encontrado','Intitulé trouvé','Stellenbezeichnung gefunden'],
 ['Not confirmed','تصدیق نہیں ہوئی','غير مؤكد','Sin confirmar','Non confirmé','Nicht bestätigt'],
 ['Company name found','کمپنی کا نام مل گیا','تم العثور على اسم الشركة','Nombre de la empresa encontrado','Nom de l’entreprise trouvé','Unternehmensname gefunden'],
 ['Employer page','آجر کا صفحہ','صفحة صاحب العمل','Página del empleador','Page de l’employeur','Arbeitgeberseite'],
 ['Exact job link found','اسی آسامی کا لنک مل گیا','تم العثور على رابط الوظيفة المحددة','Enlace exacto de la vacante encontrado','Lien exact de l’offre trouvé','Genauer Stellenlink gefunden'],
 ['Exact link not found','درست لنک نہیں ملا','لم يتم العثور على الرابط المحدد','Enlace exacto no encontrado','Lien exact introuvable','Genauer Link nicht gefunden'],
 ['Company name on employer page','آجر کے صفحے پر کمپنی کا نام','اسم الشركة في صفحة صاحب العمل','Nombre de la empresa en la página del empleador','Nom de l’entreprise sur la page employeur','Unternehmensname auf der Arbeitgeberseite'],
 ['Employer domain','آجر کا ڈومین','نطاق صاحب العمل','Dominio del empleador','Domaine de l’employeur','Arbeitgeberdomain'],
 ['A matching link supports the listing, but does not verify the employer\'s legal identity. An absent link may reflect a dynamic or incomplete careers page.','مطابق لنک آسامی کی تائید کرتا ہے مگر آجر کی قانونی شناخت کی تصدیق نہیں کرتا۔ لنک نہ ہونا متحرک یا نامکمل کیریئر صفحے کی وجہ سے ہو سکتا ہے۔','يدعم الرابط المطابق الإعلان لكنه لا يثبت الهوية القانونية لصاحب العمل. قد يعود غياب الرابط إلى صفحة وظائف ديناميكية أو غير مكتملة.','Un enlace coincidente respalda la oferta, pero no verifica la identidad legal del empleador. Su ausencia puede deberse a una página dinámica o incompleta.','Un lien correspondant corrobore l’offre sans vérifier l’identité juridique de l’employeur. Son absence peut refléter une page dynamique ou incomplète.','Ein passender Link stützt die Stellenanzeige, bestätigt aber nicht die rechtliche Identität des Arbeitgebers. Ein fehlender Link kann an einer dynamischen oder unvollständigen Karriereseite liegen.'],
 ['Last checked:','آخری جانچ:','آخر تحقق:','Última comprobación:','Dernière vérification :','Zuletzt geprüft:'],
 ['Potential warning signs','ممکنہ انتباہی علامات','علامات تحذيرية محتملة','Posibles señales de alerta','Signaux d’alerte possibles','Mögliche Warnzeichen'],
 ['Possible recruitment fee request','ممکنہ بھرتی فیس کی درخواست','طلب رسوم توظيف محتمل','Posible solicitud de tasa de contratación','Demande possible de frais de recrutement','Mögliche Forderung nach Bewerbungsgebühren'],
 ['Possible unusual payment request','غیر معمولی ادائیگی کی ممکنہ درخواست','طلب دفع غير معتاد محتمل','Posible solicitud de pago inusual','Demande de paiement inhabituelle possible','Mögliche ungewöhnliche Zahlungsaufforderung'],
 ['Possible sensitive information request','حساس معلومات کی ممکنہ درخواست','طلب معلومات حساسة محتمل','Posible solicitud de información sensible','Demande possible d’informations sensibles','Mögliche Anfrage nach sensiblen Daten'],
 ['Do not pay upfront recruitment fees or share banking credentials. Confirm the role using an independently trusted employer channel.','پیشگی بھرتی فیس ادا نہ کریں اور بینک کی لاگ ان معلومات شیئر نہ کریں۔ قابل اعتماد آزاد آجر کے ذریعے آسامی کی تصدیق کریں۔','لا تدفع رسوم توظيف مسبقة ولا تشارك بيانات الدخول المصرفية. أكد الوظيفة عبر قناة مستقلة وموثوقة لصاحب العمل.','No pagues tasas de contratación por adelantado ni compartas credenciales bancarias. Confirma el puesto mediante un canal del empleador de confianza independiente.','Ne payez pas de frais de recrutement à l’avance et ne partagez pas vos identifiants bancaires. Confirmez le poste via un canal employeur indépendamment fiable.','Zahlen Sie keine Vorausgebühren für die Vermittlung und teilen Sie keine Bankzugangsdaten. Bestätigen Sie die Stelle über einen unabhängig vertrauenswürdigen Arbeitgeberkanal.'],
];
for (const [i, lang] of ['ur','ar','es','fr','de'].entries()) {
  const file = new URL(`../src/renderer/src/locales/${lang}.json`, import.meta.url);
  const dict = JSON.parse(readFileSync(file, 'utf8'));
  for (const row of rows) dict[row[0]] = row[i + 1];
  writeFileSync(file, JSON.stringify(dict));
}
