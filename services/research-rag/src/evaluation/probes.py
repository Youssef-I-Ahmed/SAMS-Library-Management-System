"""Documented realistic probe queries (shared by scripts/eval_semantic.py and the in-app self-test).
Relevance of a record = its title contains one of the keywords (any language), judged on the real dataset."""
# (arabic query, english query, keywords (any language) that make a title relevant)
TOPICS = [
    ("التسويق الإلكتروني", "digital marketing", ["تسويق", "marketing"]),
    ("مخاطر الاستثمار في البورصة", "investment risk in the stock market", ["استثمار", "بورصة", "invest", "stock"]),
    ("أثر الضغوط الوظيفية على الأداء", "job stress and employee performance", ["ضغوط", "stress"]),
    ("جودة الخدمات المصرفية", "banking service quality", ["مصرف", "بنوك", "بنك", "bank"]),
    ("إدارة الموارد البشرية", "human resource management", ["موارد بشرية", "human resource"]),
    ("التجارة الإلكترونية", "e-commerce", ["تجارة الكترون", "التجارة الإلكترون", "e-commerce", "electronic commerce", "online"]),
    ("الحوكمة والشفافية", "corporate governance", ["حوكمة", "governance"]),
    ("السياحة والفنادق", "tourism and hotels", ["سياحة", "فنادق", "tourism", "hotel"]),
    ("التحول الرقمي", "digital transformation", ["تحول الرقمي", "digital transformation", "digital"]),
    ("المسؤولية الاجتماعية للشركات", "corporate social responsibility", ["مسؤولية اجتماعية", "social responsibility"]),
]
NOISE = ["zzzqqq", "xqvbnm lkjhg", "ؤؤؤءءء", "asdfghjkl", "volcanic rocks classification", "football world cup winners"]
