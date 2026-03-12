---
title: 题解：CF992B Nastya Studies Informatics
date: 2026-03-09 20:19:43
tags:
---
首先，我们知道 $\operatorname{lcm}(x,y) \times \gcd(x,y)=a \times b$。

之后，就可以构造了：

因为 $a$ 一定要整除 $\operatorname{lcm}(a,b)$。

再枚举 $\operatorname{lcm}(a,b)$ 的因数。

每个因数就判断一下，加入答案。

判断的代码：

```cpp
bool check(int a){
	int b=x*y/a;
    return !(a<l||a>r||b<l||b>r||__gcd(a,b)!=x);
}
```

代码楼上楼下都已经写的很明白了，我就不在赘述了。