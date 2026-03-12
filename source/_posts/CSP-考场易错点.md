---
title: CSP 考场易错点
date: 2026-03-09 20:44:42
tags:
  - CSP
  - 理论
categories:
  - 算法·理论
sticky: 150
---
## UB（未定义行为）

未定义行为就是你的代码出现了语言标准没有预料到的代码时，你的代码就会出现一些奇怪的错。

有时你的评测是对的，而这种错误会在 CCF ~~垃圾~~的评测环境中暴露出来，没注意到就会爆零。

### printf

你**一定**要看好你输出的和 `printf` 中的类型是否一样，不然程序会错。

### 有符号整数溢出也是未定义行为。

### 返回值非 void 函数一定要有返回！

错误示范：

```cpp
int x(int a){cout<<a;}
```

正确示范：

```cpp
int x(int a){cout<<a; return 1；}
```

### 数据结构 RE

vector 下标越界。

vector、queue、deque、stack 等为空时进行 pop。

### 其它

int,long long 除以 $0$ 或模 $0$ 也是未定义行为。

## 文件读写

~~都是可以进迷惑行为大赏的。~~

freopen：
```
freopen("题目名.in","r",stdin);
freopen("题目名.out","w",stdout);
```

`"r"` 一定要用双引号！

文件夹：

```
|----- 考号
  ｜----- T1名字
    ｜----- T1名字.cpp
  ｜----- T2名字
    ｜----- T2名字.cpp
  ｜----- T3名字
    ｜----- T3名字.cpp
  ｜----- T4名字
    ｜----- T4名字.cpp
```

另外你需要注意文件的后缀名：

![](https://cdn.luogu.com.cn/upload/image_hosting/c9na8ao1.png)

这里引用一些 @chenxi2009 的图，我是用 mac 的，拍不了。

不然就可能出现 `duel.cpp.cpp` 的情况。

还有文件名一定要检查是否跟题目一模一样！

## #define int long long

是可以的~~因为我用过~~。

CCF 下发的 pdf 文件中提到：主函数返回类型只能是 int。

所以 signed main 行吗？

但是 `signed=int=signed int`，可以的~~因为我用过~~。

虽然可以用，但是有可能空间爆炸。

## 读入

习惯用 `cin/cout` 的可以用 ```ios::sync_with_stdio(false),cin.tie(0),cout.tie(0);```

爱用 `scanf/printf` 也可以，但是要注意类型是否正确。