---
title: 题解：SP2884 MARTIAN - Martian Mining
date: 2026-03-09 20:19:43
tags:
---
思路：

我们发现，如果要采 $(a,b)$ 上的矿，那么运输路上（即 $(a,b-1),(a,b-2)...(a,1)$ 或$(a-1,b),(a-2,b)...(1,b)$）的这种矿物都要全采。

得知这一点后，我们考虑是用动归，定义 $f_{i,j}$ 是为在以 $(i,j)$ 为右下角的子矩阵中的最大采矿量。

维护两个前缀和数组 $a,b$ (具体是什么见代码），$f_{i,j}=\max(f_{i-1,j}+a_{i,j},f_{i,j-1}+b_{i,j})$。

代码：

```cpp
#include<bits/stdc++.h>
#define int long long
using namespace std;
int n,m,a[505][505],b[505][505],f[505][505];
signed main(){
	while(1){
		cin>>n>>m;
		if(n==0&&m==0) break;
		for(int i=1;i<=n;i++)
			for(int j=1;j<=m;j++)
				cin>>a[i][j],a[i][j]+=a[i][j-1]; //前缀和数组 a
		for(int i=1;i<=n;i++)
			for(int j=1;j<=m;j++)
				cin>>b[i][j],b[i][j]+=b[i-1][j]; //前缀和数组 b
		for(int i=1;i<=n;i++)
			for(int j=1;j<=m;j++)
				f[i][j]=max(f[i-1][j]+a[i][j],f[i][j-1]+b[i][j]);
		cout<<f[n][m]<<'\n';
	}
	return 0;
}
```